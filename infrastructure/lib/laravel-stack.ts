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
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';
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
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true,
      lifecycleRules: [
        {
          maxImageCount: 5,
        },
      ],
    });

    const nginxRepository = new ecr.Repository(this, 'LaravelNginxRepository', {
      repositoryName: 'laravel-nginx',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteImages: true,
      lifecycleRules: [
        {
          maxImageCount: 5,
        },
      ],
    });

    // If deployOnlyECR is true, only deploy ECR repositories
    if (this.node.tryGetContext('deployOnlyECR')) {
      // Output the ECR repository URIs
      new cdk.CfnOutput(this, 'PhpRepositoryUri', {
        value: phpRepository.repositoryUri,
        description: 'PHP-FPM ECR Repository URI',
      });

      new cdk.CfnOutput(this, 'NginxRepositoryUri', {
        value: nginxRepository.repositoryUri,
        description: 'Nginx ECR Repository URI',
      });

      return;
    }

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

    // Create Cloud Map namespace for service discovery
    const namespace = new servicediscovery.PrivateDnsNamespace(this, 'LaravelNamespace', {
      vpc,
      name: 'laravel.local',
      description: 'Private DNS namespace for Laravel services',
    });

    // Add the namespace to the cluster
    cluster.addDefaultCloudMapNamespace({
      type: servicediscovery.NamespaceType.DNS_PRIVATE,
      vpc,
      name: 'laravel.local',
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
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
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
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      monitoringInterval: cdk.Duration.minutes(1),
      storageEncrypted: true,
      multiAz: true,
      parameterGroup: new rds.ParameterGroup(this, 'LaravelDbParameterGroup', {
        engine: rds.DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_8_0_35,
        }),
        parameters: {
          'character_set_server': 'utf8mb4',
          'collation_server': 'utf8mb4_unicode_ci',
          'max_connections': '1000',
          'innodb_buffer_pool_size': '2147483648', // 2GB for T3.MEDIUM
        },
      }),
    });

    // Output the RDS secret ARN for reference
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbInstance.secret?.secretArn || 'Secret not available',
      description: 'RDS Secret ARN',
    });

    // Reference existing SSM Parameter for APP_KEY
    const appKeyParam = ssm.StringParameter.fromStringParameterName(
      this,
      'AppKeyParameter',
      `/${process.env.CDK_DEFAULT_ACCOUNT}/prod/APP_KEY`
    );

    // Create IAM roles for the ECS tasks
    const iamRoles = new LaravelIamRoles(this, 'LaravelIamRoles', {
      account: this.account,
      region: this.region,
    });

    // Create ECS Task Definition for PHP-FPM
    const phpTaskDefinition = new ecs.FargateTaskDefinition(this, 'LaravelPhpTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: iamRoles.phpTaskRole,
    });

    // Add PHP-FPM container to the task definition
    const phpContainer = phpTaskDefinition.addContainer('LaravelPhpContainer', {
      image: ecs.ContainerImage.fromEcrRepository(phpRepository, this.node.tryGetContext('GITHUB_SHA') || 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'LaravelPhp' }),
      environment: {
        DB_CONNECTION: 'mysql',
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: dbInstance.dbInstanceEndpointPort,
        DB_DATABASE: 'laravel',
        DB_USERNAME: 'laravel',
        DB_PASSWORD: 'changeme',
        APP_ENV: process.env.APP_ENV || 'production',
        APP_DEBUG: process.env.APP_DEBUG || 'false',
        APP_URL: process.env.APP_URL || 'http://localhost',
      },
      secrets: {
        APP_KEY: ecs.Secret.fromSsmParameter(appKeyParam),
        DB_USERNAME: ecs.Secret.fromSecretsManager(dbInstance.secret!, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbInstance.secret!, 'password'),
      },
    });

    // Create ECS Service for PHP-FPM
    const phpService = new ecs.FargateService(this, 'LaravelPhpService', {
      cluster,
      taskDefinition: phpTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      circuitBreaker: {
        rollback: false,
      },
      cloudMapOptions: {
        name: 'php',
        dnsRecordType: servicediscovery.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(30),
        container: phpContainer,
        containerPort: 9000,
      },
    });

    // Create ECS Task Definition for Nginx
    const nginxTaskDefinition = new ecs.FargateTaskDefinition(this, 'LaravelNginxTask', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: iamRoles.nginxTaskRole,
    });

    // Add Nginx container to the task definition
    const nginxContainer = nginxTaskDefinition.addContainer('LaravelNginxContainer', {
      image: ecs.ContainerImage.fromEcrRepository(nginxRepository, this.node.tryGetContext('GITHUB_SHA') || 'latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'LaravelNginx' }),
      portMappings: [{ containerPort: 80 }],
      environment: {
        PHP_SERVICE_HOST: `${phpService.cloudMapService!.serviceName}.${phpService.cloudMapService!.namespace.namespaceName}`,
        PHP_SERVICE_PORT: '9000',
      },
    });

    // Create Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'LaravelALB', {
      vpc,
      internetFacing: true,
    });

    // Create ALB Target Group
    const nginxTargetGroup = new elbv2.ApplicationTargetGroup(this, 'LaravelNginxTargetGroup', {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(5),
        interval: cdk.Duration.seconds(30),
      },
    });

    // Create ALB Listener
    const listener = alb.addListener('LaravelListener', {
      port: 80,
      defaultTargetGroups: [nginxTargetGroup],
    });

    // Create ECS Service for Nginx
    const nginxService = new ecs.FargateService(this, 'LaravelNginxService', {
      cluster,
      taskDefinition: nginxTaskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      circuitBreaker: {
        rollback: false,
      },
    });

    // Allow traffic from Nginx to PHP-FPM
    phpService.connections.allowFrom(
      nginxService,
      ec2.Port.tcp(9000),
      'Allow traffic from Nginx to PHP-FPM'
    );

    // Allow traffic from ALB to Nginx
    nginxService.connections.allowFrom(
      alb,
      ec2.Port.tcp(80),
      'Allow traffic from ALB to Nginx'
    );

    // Allow traffic from PHP-FPM to RDS
    dbSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(phpService.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(3306),
      'Allow MySQL access from PHP-FPM'
    );

    // Add the Nginx service to the target group
    nginxTargetGroup.addTarget(nginxService);

    // Output the service names for reference
    new cdk.CfnOutput(this, 'PhpServiceName', {
      value: phpService.serviceName,
      description: 'PHP-FPM Service Name',
    });

    new cdk.CfnOutput(this, 'NginxServiceName', {
      value: nginxService.serviceName,
      description: 'Nginx Service Name',
    });

    // Output the task definition ARNs
    new cdk.CfnOutput(this, 'PhpTaskDefinitionArn', {
      value: phpTaskDefinition.taskDefinitionArn,
      description: 'PHP-FPM Task Definition ARN',
    });

    new cdk.CfnOutput(this, 'NginxTaskDefinitionArn', {
      value: nginxTaskDefinition.taskDefinitionArn,
      description: 'Nginx Task Definition ARN',
    });

    // Output the ECR repository URIs
    new cdk.CfnOutput(this, 'PhpRepositoryUri', {
      value: phpRepository.repositoryUri,
      description: 'PHP-FPM ECR Repository URI',
    });

    new cdk.CfnOutput(this, 'NginxRepositoryUri', {
      value: nginxRepository.repositoryUri,
      description: 'Nginx ECR Repository URI',
    });

    // Output the ALB DNS name
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'Application Load Balancer DNS Name',
    });
  }
} 