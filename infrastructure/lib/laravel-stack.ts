import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class LaravelStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Add stack tags
    cdk.Tags.of(this).add('Environment', 'Production');
    cdk.Tags.of(this).add('Project', 'Laravel');

    // Create VPC
    const vpc = new ec2.Vpc(this, 'LaravelVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'LaravelCluster', {
      vpc,
      containerInsights: true,
    });

    // Create ECR Repository for PHP-FPM
    const phpRepository = new ecr.Repository(this, 'LaravelPhpRepository', {
      repositoryName: 'laravel-app',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // Create ECR Repository for Nginx
    const nginxRepository = new ecr.Repository(this, 'LaravelNginxRepository', {
      repositoryName: 'laravel-nginx',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    // Create ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, 'LaravelALB', {
      vpc,
      internetFacing: true,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'LaravelTargetGroup', {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
    });

    alb.addListener('LaravelListener', {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    // Create RDS instance
    const dbSecret = new secretsmanager.Secret(this, 'LaravelDB/Secret', {
      secretName: `${process.env.CDK_DEFAULT_ACCOUNT}/prod/DB_PASSWORD`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: process.env.DB_USERNAME || 'laravel' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });

    const dbSubnets = new rds.SubnetGroup(this, 'LaravelDB/Subnets/Default', {
      vpc,
      description: 'Subnet group for RDS MySQL instance',
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'LaravelDB/SecurityGroup', {
      vpc,
      description: 'Security group for RDS MySQL instance',
      allowAllOutbound: false,
    });

    // Allow outbound traffic to the VPC CIDR only
    dbSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'Allow outbound traffic to VPC CIDR'
    );

    const db = new rds.DatabaseInstance(this, 'LaravelDB', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_35,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.SMALL
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      databaseName: 'laravel',
      credentials: rds.Credentials.fromSecret(dbSecret),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      subnetGroup: dbSubnets,
    });

    // Create ECS Task Definition for PHP-FPM
    const phpTaskDefinition = new ecs.FargateTaskDefinition(this, 'LaravelPhpTask', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Add PHP-FPM container to task
    const phpContainer = phpTaskDefinition.addContainer('LaravelPhpContainer', {
      image: ecs.ContainerImage.fromEcrRepository(phpRepository, process.env.GITHUB_SHA || 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'laravel-php' }),
      environment: {
        DB_CONNECTION: 'mysql',
        DB_HOST: db.dbInstanceEndpointAddress,
        DB_PORT: db.dbInstanceEndpointPort.toString(),
        DB_DATABASE: 'laravel',
        DB_USERNAME: process.env.DB_USERNAME || 'laravel',
        APP_ENV: 'production',
        APP_DEBUG: 'false',
        APP_URL: `http://${alb.loadBalancerDnsName}`,
      },
      secrets: {
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
        APP_KEY: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterAttributes(this, 'AppKey', {
            parameterName: `/${process.env.CDK_DEFAULT_ACCOUNT}/prod/APP_KEY`,
          })
        ),
      },
    });

    // Create ECS Task Definition for Nginx
    // Valid Fargate CPU and memory combinations:
    // CPU (vCPU) | Memory (MiB)
    // 256 (.25)  | 512, 1024, 2048
    // 512 (.5)   | 1024-4096
    // 1024 (1)   | 2048-8192
    // 2048 (2)   | 4096-16384
    // 4096 (4)   | 8192-30720
    const nginxTaskDefinition = new ecs.FargateTaskDefinition(this, 'LaravelNginxTask', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Add Nginx container to task
    const nginxContainer = nginxTaskDefinition.addContainer('LaravelNginxContainer', {
      image: ecs.ContainerImage.fromEcrRepository(nginxRepository, process.env.GITHUB_SHA || 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'laravel-nginx' }),
    });

    nginxContainer.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // Create ECS Service for PHP-FPM
    const phpService = new ecs.FargateService(this, 'LaravelPhpService', {
      cluster,
      taskDefinition: phpTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // Create ECS Service for Nginx
    const nginxService = new ecs.FargateService(this, 'LaravelNginxService', {
      cluster,
      taskDefinition: nginxTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    nginxService.attachToApplicationTargetGroup(targetGroup);

    // Allow ALB to access Nginx tasks
    nginxService.connections.allowFrom(alb, ec2.Port.tcp(80), 'Allow ALB to access Nginx tasks');

    // Allow Nginx tasks to access PHP-FPM tasks
    nginxService.connections.allowFrom(phpService, ec2.Port.tcp(9000), 'Allow Nginx to access PHP-FPM');

    // Allow PHP-FPM tasks to access RDS
    db.connections.allowDefaultPortFrom(phpService, 'Allow PHP-FPM tasks to access RDS');

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Load Balancer DNS',
    });

    new cdk.CfnOutput(this, 'PhpEcrRepositoryUri', {
      value: phpRepository.repositoryUri,
      description: 'PHP-FPM ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'NginxEcrRepositoryUri', {
      value: nginxRepository.repositoryUri,
      description: 'Nginx ECR Repository URI',
    });
  }
} 