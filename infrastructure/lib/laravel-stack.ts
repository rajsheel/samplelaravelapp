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

    // Create ECR Repository
    const repository = new ecr.Repository(this, 'LaravelRepository', {
      repositoryName: 'laravel-app',
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
        path: '/health',
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
      allowAllOutbound: true,
    });

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

    // Create ECS Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'LaravelTask', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Add container to task
    const container = taskDefinition.addContainer('LaravelContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, process.env.GITHUB_SHA || 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'laravel' }),
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

    container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // Create ECS Service
    const service = new ecs.FargateService(this, 'LaravelService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    service.attachToApplicationTargetGroup(targetGroup);

    // Allow ALB to access ECS tasks
    service.connections.allowFrom(alb, ec2.Port.tcp(80), 'Allow ALB to access ECS tasks');

    // Allow ECS tasks to access RDS
    db.connections.allowDefaultPortFrom(service, 'Allow ECS tasks to access RDS');

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Load Balancer DNS',
    });

    new cdk.CfnOutput(this, 'ECRRepositoryUri', {
      value: repository.repositoryUri,
      description: 'ECR Repository URI',
    });
  }
} 