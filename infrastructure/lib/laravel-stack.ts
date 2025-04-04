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
import { Construct } from 'constructs';

export class LaravelStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Add stack tags
    cdk.Tags.of(this).add('Environment', 'Production');
    cdk.Tags.of(this).add('Project', 'Laravel');

    // Create VPC with existing VPC lookup
    const vpc = new ec2.Vpc(this, 'LaravelVPC', {
      maxAzs: 2,
      natGateways: 1,
      vpcName: 'laravel-vpc', // Named VPC for easier lookup
    });

    // Create ECS Cluster with existing cluster lookup
    const cluster = new ecs.Cluster(this, 'LaravelCluster', {
      vpc,
      clusterName: 'laravel-cluster', // Named cluster for easier lookup
      containerInsights: true,
    });

    // Create Aurora MySQL Cluster with existing cluster lookup
    const dbCluster = new rds.ServerlessCluster(this, 'LaravelDB', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_03_0,
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      scaling: {
        autoPause: cdk.Duration.minutes(10),
        minCapacity: rds.AuroraCapacityUnit.ACU_2,
        maxCapacity: rds.AuroraCapacityUnit.ACU_16,
      },
      defaultDatabaseName: 'laravel',
      credentials: rds.Credentials.fromGeneratedSecret('laravel'),
      backupRetention: cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
      enableDataApi: true,
      clusterIdentifier: 'laravel-db', // Named cluster for easier lookup
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(
        this,
        'DBParameterGroup',
        'default.aurora-mysql8.0'
      ),
    });

    // Create ECR Repository with existing repository lookup
    const repository = new ecr.Repository(this, 'LaravelRepository', {
      repositoryName: 'laravel-app',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true,
      lifecycleRules: [
        {
          maxImageCount: 5,
        },
      ],
    });

    // Create Task Role with existing role lookup
    const taskRole = new iam.Role(this, 'LaravelTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: 'laravel-task-role', // Named role for easier lookup
    });

    // Add permissions to access SSM Parameter Store
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: ['*'],
      })
    );

    // Add permissions to access CloudWatch Logs
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:CreateLogGroup',
        ],
        resources: ['*'],
      })
    );

    // Create Task Definition with existing task definition lookup
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'LaravelTask', {
      memoryLimitMiB: 1024,
      cpu: 512,
      taskRole,
      family: 'laravel-task', // Named family for easier lookup
    });

    // Add container to task
    const container = taskDefinition.addContainer('LaravelContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'laravel',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      environment: {
        APP_ENV: 'production',
        APP_DEBUG: 'false',
        DB_CONNECTION: 'mysql',
        DB_HOST: dbCluster.clusterEndpoint.hostname,
        DB_PORT: dbCluster.clusterEndpoint.port.toString(),
        DB_DATABASE: 'laravel',
        DB_USERNAME: 'laravel',
        CACHE_DRIVER: 'redis',
        QUEUE_CONNECTION: 'redis',
        SESSION_DRIVER: 'redis',
      },
      secrets: {
        DB_PASSWORD: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromSecureStringParameterAttributes(this, 'DBPasswordParam', {
            parameterName: '/laravel/prod/DB_PASSWORD',
            version: 1,
          })
        ),
        APP_KEY: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromSecureStringParameterAttributes(this, 'APPKeyParam', {
            parameterName: '/laravel/prod/APP_KEY',
            version: 1,
          })
        ),
      },
    });

    container.addPortMappings({
      containerPort: 9000,
      hostPort: 9000,
    });

    // Create ALB with existing ALB lookup
    const alb = new elbv2.ApplicationLoadBalancer(this, 'LaravelALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'laravel-alb', // Named ALB for easier lookup
    });

    // Create ALB Target Group with existing target group lookup
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'LaravelTargetGroup', {
      vpc,
      port: 9000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
      targetGroupName: 'laravel-tg', // Named target group for easier lookup
    });

    // Add listener to ALB
    const listener = alb.addListener('LaravelListener', {
      port: 80,
      defaultTargetGroups: [targetGroup],
    });

    // Create ECS Service with existing service lookup
    const service = new ecs.FargateService(this, 'LaravelService', {
      cluster,
      taskDefinition,
      desiredCount: 2,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      serviceName: 'laravel-service', // Named service for easier lookup
    });

    // Allow traffic from ALB to ECS
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc,
      description: 'Security group for ALB',
      allowAllOutbound: true,
      securityGroupName: 'laravel-alb-sg', // Named security group for easier lookup
    });

    service.connections.allowFrom(
      albSecurityGroup,
      ec2.Port.tcp(9000),
      'Allow traffic from ALB'
    );

    // Allow ECS tasks to access RDS
    dbCluster.connections.allowDefaultPortFrom(service);

    // Allow ALB to access ECS tasks
    service.connections.allowFrom(alb, ec2.Port.tcp(80));

    // Output the ALB DNS
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Load Balancer DNS',
    });

    // Output the ECR repository URI
    new cdk.CfnOutput(this, 'ECRRepositoryURI', {
      value: repository.repositoryUri,
      description: 'ECR Repository URI',
    });

    // Output the Aurora cluster endpoint
    new cdk.CfnOutput(this, 'DBEndpoint', {
      value: dbCluster.clusterEndpoint.hostname,
      description: 'Aurora Cluster Endpoint',
    });
  }
} 