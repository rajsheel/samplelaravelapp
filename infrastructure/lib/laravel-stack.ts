import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2_targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { LaravelIamRoles } from './iam-roles';

/**
 * LaravelStack - AWS CDK Stack for Laravel Application
 * 
 * This stack creates a complete infrastructure for running a Laravel application on AWS:
 * - VPC with public and private subnets
 * - RDS MySQL database
 * - ECS Fargate cluster with PHP-FPM and Nginx containers
 * - Application Load Balancer
 * - ECR repositories for Docker images
 * - Security groups and IAM roles
 */
export class LaravelStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Add stack tags
    cdk.Tags.of(this).add('Environment', 'Production');
    cdk.Tags.of(this).add('Project', 'Laravel');

    // Create ECR repositories for our Docker images
    const phpRepository = new ecr.Repository(this, 'LaravelPhpRepository', {
      repositoryName: 'laravel-app',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain the repository when stack is destroyed
      lifecycleRules: [
        {
          maxImageCount: 5, // Keep only the 5 most recent images
          description: 'Only keep 5 most recent images',
        },
      ],
    });

    const nginxRepository = new ecr.Repository(this, 'LaravelNginxRepository', {
      repositoryName: 'laravel-nginx',
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain the repository when stack is destroyed
      lifecycleRules: [
        {
          maxImageCount: 5, // Keep only the 5 most recent images
          description: 'Only keep 5 most recent images',
        },
      ],
    });

    // Create VPC with public and private subnets
    // This VPC will host all our resources in a secure network
    const vpc = new ec2.Vpc(this, 'LaravelVPC', {
      maxAzs: 2, // Use 2 Availability Zones for high availability
      natGateways: 1, // Use 1 NAT Gateway to reduce costs
    });

    // Create ECS Cluster
    // This cluster will run our containerized Laravel application
    const cluster = new ecs.Cluster(this, 'LaravelCluster', {
      vpc,
      // Note: containerInsights is deprecated, but kept for compatibility
      containerInsights: true,
    });

    // Create RDS Security Group
    // This security group controls access to the RDS instance
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc,
      description: 'Security group for RDS MySQL instance',
      allowAllOutbound: false, // Restrict outbound traffic for better security
    });

    // Allow inbound MySQL traffic from the ECS tasks
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(3306),
      'Allow MySQL access from within the VPC'
    );

    // Allow outbound traffic to the VPC CIDR block
    // This is needed for the RDS instance to communicate with other resources in the VPC
    dbSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.allTraffic(),
      'Allow all outbound traffic to VPC CIDR block'
    );

    // Create RDS Subnet Group
    // This subnet group defines which subnets the RDS instance can be placed in
    const dbSubnetGroup = new rds.SubnetGroup(this, 'RdsSubnetGroup', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      description: 'Subnet group for RDS MySQL instance',
    });

    // Create RDS Instance
    // This is the MySQL database for the Laravel application
    const dbInstance = new rds.DatabaseInstance(this, 'LaravelDatabase', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_35,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      // For production workloads, consider using T3.MEDIUM or larger
      // This instance type can be made configurable via environment variables or properties
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      subnetGroup: dbSubnetGroup,
      databaseName: 'laravel',
      credentials: rds.Credentials.fromGeneratedSecret('laravel', {
        secretName: `/${process.env.CDK_DEFAULT_ACCOUNT}/prod/laravel-db-credentials`,
        excludeCharacters: '"@/\\',
      }),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT, // Preserve data on deletion
      monitoringInterval: cdk.Duration.minutes(1),
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      // Add encryption for better security
      storageEncrypted: true,
      // Add multi-AZ for high availability
      multiAz: true,
      // Add parameter group for better performance
      parameterGroup: new rds.ParameterGroup(this, 'LaravelDbParameterGroup', {
        engine: rds.DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_8_0_35,
        }),
        parameters: {
          'character_set_server': 'utf8mb4',
          'collation_server': 'utf8mb4_unicode_ci',
          'max_connections': '1000',
          'innodb_buffer_pool_size': '1073741824', // 1GB
        },
      }),
    });

    // Output the RDS secret ARN for reference
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbInstance.secret?.secretArn || 'Secret not available',
      description: 'RDS Secret ARN',
    });

    // Create SSM Parameter for APP_KEY
    const appKeyParam = new ssm.StringParameter(this, 'AppKeyParameter', {
      parameterName: `/${process.env.CDK_DEFAULT_ACCOUNT}/prod/APP_KEY`,
      stringValue: process.env.APP_KEY || 'base64:' + Buffer.from(Math.random().toString()).toString('base64'),
      description: 'Laravel application key',
      tier: ssm.ParameterTier.STANDARD,
      type: ssm.ParameterType.SECURE_STRING
    });

    // Add a custom resource to handle existing parameters
    new cdk.CustomResource(this, 'AppKeyParameterHandler', {
      serviceToken: new lambda.Function(this, 'AppKeyParameterFunction', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(`
          exports.handler = async (event) => {
            const AWS = require('aws-sdk');
            const ssm = new AWS.SSM();
            
            if (event.RequestType === 'Create' || event.RequestType === 'Update') {
              try {
                await ssm.putParameter({
                  Name: '${appKeyParam.parameterName}',
                  Value: '${appKeyParam.stringValue}',
                  Type: 'SecureString',
                  Overwrite: true
                }).promise();
              } catch (error) {
                console.error('Error updating parameter:', error);
              }
            }
            
            return {
              PhysicalResourceId: '${appKeyParam.parameterName}',
              Data: {}
            };
          };
        `),
        initialPolicy: [
          new iam.PolicyStatement({
            actions: ['ssm:PutParameter'],
            resources: ['*']
          })
        ]
      }).functionArn
    });

    // Create IAM roles for the ECS tasks
    const iamRoles = new LaravelIamRoles(this, 'LaravelIamRoles', {
      account: this.account,
      region: this.region,
    });

    // Create ECS Task Definition for PHP-FPM
    // This task definition defines how the PHP-FPM container should run
    const phpTaskDefinition = new ecs.FargateTaskDefinition(this, 'LaravelPhpTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: iamRoles.phpTaskRole,
    });

    // Add PHP-FPM container to the task definition
    const phpContainer = phpTaskDefinition.addContainer('LaravelPhpContainer', {
      image: ecs.ContainerImage.fromEcrRepository(phpRepository, process.env.GITHUB_SHA || 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'LaravelPhp' }),
      environment: {
        DB_CONNECTION: 'mysql',
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: dbInstance.dbInstanceEndpointPort,
        DB_DATABASE: 'laravel',
        DB_USERNAME: 'laravel', // Default username for initial deployment
        DB_PASSWORD: 'changeme', // Default password for initial deployment
        APP_ENV: process.env.APP_ENV || 'production',
        APP_DEBUG: process.env.APP_DEBUG || 'false',
        APP_URL: process.env.APP_URL || 'http://localhost',
      },
      secrets: {
        // Only use APP_KEY from SSM, DB credentials will be updated after deployment
        APP_KEY: ecs.Secret.fromSsmParameter(appKeyParam),
      },
    });

    // Create ECS Task Definition for Nginx
    // This task definition defines how the Nginx container should run
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
      executionRole: iamRoles.nginxTaskRole,
    });

    // Add Nginx container to the task definition
    const nginxContainer = nginxTaskDefinition.addContainer('LaravelNginxContainer', {
      image: ecs.ContainerImage.fromEcrRepository(nginxRepository, process.env.GITHUB_SHA || 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'LaravelNginx' }),
      portMappings: [{ containerPort: 80 }],
    });

    // Create Application Load Balancer
    // This load balancer distributes traffic to the Nginx containers
    const alb = new elbv2.ApplicationLoadBalancer(this, 'LaravelALB', {
      vpc,
      internetFacing: true,
    });

    // Create ALB Target Group
    // This target group defines how traffic is routed to the Nginx containers
    const nginxTargetGroup = new elbv2.ApplicationTargetGroup(this, 'LaravelNginxTargetGroup', {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
    });

    // Add listener to the ALB
    // This listener accepts HTTP traffic on port 80
    const listener = alb.addListener('LaravelListener', {
      port: 80,
      defaultTargetGroups: [nginxTargetGroup],
    });

    // Create ECS Service for PHP-FPM
    // This service runs the PHP-FPM containers
    const phpService = new ecs.FargateService(this, 'LaravelPhpService', {
      cluster,
      taskDefinition: phpTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      // Enable circuit breaker for automatic rollback
      circuitBreaker: {
        rollback: true,
      },
      // Add health check grace period
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // Create ECS Service for Nginx
    // This service runs the Nginx containers
    const nginxService = new ecs.FargateService(this, 'LaravelNginxService', {
      cluster,
      taskDefinition: nginxTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      // Enable circuit breaker for automatic rollback
      circuitBreaker: {
        rollback: true,
      },
      // Add health check grace period
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // Allow traffic from Nginx to PHP-FPM
    // This security group rule allows the Nginx containers to communicate with the PHP-FPM containers
    nginxService.connections.allowFrom(
      phpService,
      ec2.Port.tcp(9000),
      'Allow traffic from Nginx to PHP-FPM'
    );

    // Allow traffic from ALB to Nginx
    // This security group rule allows the ALB to communicate with the Nginx containers
    nginxService.connections.allowFrom(
      alb,
      ec2.Port.tcp(80),
      'Allow traffic from ALB to Nginx'
    );

    // Allow traffic from PHP-FPM to RDS
    // This security group rule allows the PHP-FPM containers to communicate with the RDS instance
    dbSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(phpService.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(3306),
      'Allow MySQL access from PHP-FPM'
    );

    // Add Nginx service to the target group
    // This registers the Nginx containers with the ALB target group
    nginxTargetGroup.addTarget(nginxService);

    // Output the ALB DNS name
    // This output can be used to access the application
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: alb.loadBalancerDnsName,
      description: 'Load Balancer DNS',
    });

    // Output the ECR repository URIs
    // These outputs can be used to push Docker images to the repositories
    new cdk.CfnOutput(this, 'PhpRepositoryUri', {
      value: phpRepository.repositoryUri,
      description: 'PHP-FPM ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'NginxRepositoryUri', {
      value: nginxRepository.repositoryUri,
      description: 'Nginx ECR Repository URI',
    });
  }
} 