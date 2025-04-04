"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaravelStack = void 0;
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const ecs = require("aws-cdk-lib/aws-ecs");
const ecr = require("aws-cdk-lib/aws-ecr");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const rds = require("aws-cdk-lib/aws-rds");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const ssm = require("aws-cdk-lib/aws-ssm");
class LaravelStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            credentials: rds.Credentials.fromGeneratedSecret('admin'),
            backupRetention: cdk.Duration.days(7),
            removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
            deletionProtection: false,
            enableDataApi: true,
            clusterIdentifier: 'laravel-db', // Named cluster for easier lookup
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
        taskRole.addToPolicy(new iam.PolicyStatement({
            actions: ['ssm:GetParameter', 'ssm:GetParameters'],
            resources: ['*'],
        }));
        // Add permissions to access CloudWatch Logs
        taskRole.addToPolicy(new iam.PolicyStatement({
            actions: [
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:CreateLogGroup',
            ],
            resources: ['*'],
        }));
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
                DB_CONNECTION: 'mysql',
                DB_HOST: dbCluster.clusterEndpoint.hostname,
                DB_PORT: dbCluster.clusterEndpoint.port.toString(),
                DB_DATABASE: 'laravel',
                DB_USERNAME: 'admin',
                CACHE_DRIVER: 'redis',
                QUEUE_CONNECTION: 'redis',
                SESSION_DRIVER: 'redis',
            },
            secrets: {
                DB_PASSWORD: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'DBPassword', {
                    parameterName: '/laravel/db/password',
                    version: 1,
                })),
                APP_KEY: ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'AppKey', {
                    parameterName: '/laravel/app/key',
                    version: 1,
                })),
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
        service.connections.allowFrom(albSecurityGroup, ec2.Port.tcp(9000), 'Allow traffic from ALB');
        // Allow traffic from ECS to Aurora
        dbCluster.connections.allowFrom(service, ec2.Port.tcp(3306), 'Allow MySQL access from ECS');
        // Store database credentials in SSM Parameter Store
        new ssm.StringParameter(this, 'DBPasswordParam', {
            parameterName: '/laravel/db/password',
            stringValue: dbCluster.secret.secretValueFromJson('password').toString(),
            type: ssm.ParameterType.SECURE_STRING,
        });
        // Store application key in SSM Parameter Store
        new ssm.StringParameter(this, 'AppKeyParam', {
            parameterName: '/laravel/app/key',
            stringValue: 'base64:' + Buffer.from(require('crypto').randomBytes(32)).toString('base64'),
            type: ssm.ParameterType.SECURE_STRING,
        });
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
exports.LaravelStack = LaravelStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFyYXZlbC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9sYXJhdmVsLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsNkNBQTZDO0FBQzdDLDJDQUEyQztBQUMzQyxnRUFBZ0U7QUFDaEUsMkNBQTJDO0FBSTNDLE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsaUJBQWlCO1FBQ2pCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDbkQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU1QyxzQ0FBc0M7UUFDdEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDMUMsTUFBTSxFQUFFLENBQUM7WUFDVCxXQUFXLEVBQUUsQ0FBQztZQUNkLE9BQU8sRUFBRSxhQUFhLEVBQUUsOEJBQThCO1NBQ3ZELENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ3RELEdBQUc7WUFDSCxXQUFXLEVBQUUsaUJBQWlCLEVBQUUsa0NBQWtDO1lBQ2xFLGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsMkRBQTJEO1FBQzNELE1B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cUJBQXFCO1FBQ3JCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxtQkFBbUI7WUFDOUIsV0FBVyxFQUFFLG1CQUFtQjtTQUNqQyxDQUFDLENBQUM7UUFFSCxnQ0FBZ0M7UUFDaEMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsVUFBVSxDQUFDLGFBQWE7WUFDL0IsV0FBVyxFQUFFLG9CQUFvQjtTQUNsQyxDQUFDLENBQUM7UUFFSCxxQ0FBcUM7UUFDckMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxlQUFlLENBQUMsUUFBUTtZQUN6QyxXQUFXLEVBQUUseUJBQXlCO1NBQ3ZDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhPRCxvQ0F3T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xuaW1wb3J0ICogYXMgZWNyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3InO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyByZHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJkcyc7XG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuZXhwb3J0IGNsYXNzIExhcmF2ZWxTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIEFkZCBzdGFjayB0YWdzXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdFbnZpcm9ubWVudCcsICdQcm9kdWN0aW9uJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgJ0xhcmF2ZWwnKTtcblxuICAgIC8vIENyZWF0ZSBWUEMgd2l0aCBleGlzdGluZyBWUEMgbG9va3VwXG4gICAgY29uc3QgdnBjID0gbmV3IGVjMi5WcGModGhpcywgJ0xhcmF2ZWxWUEMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICBuYXRHYXRld2F5czogMSxcbiAgICAgIHZwY05hbWU6ICdsYXJhdmVsLXZwYycsIC8vIE5hbWVkIFZQQyBmb3IgZWFzaWVyIGxvb2t1cFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBDbHVzdGVyIHdpdGggZXhpc3RpbmcgY2x1c3RlciBsb29rdXBcbiAgICBjb25zdCBjbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdMYXJhdmVsQ2x1c3RlcicsIHtcbiAgICAgIHZwYyxcbiAgICAgIGNsdXN0ZXJOYW1lOiAnbGFyYXZlbC1jbHVzdGVyJywgLy8gTmFtZWQgY2x1c3RlciBmb3IgZWFzaWVyIGxvb2t1cFxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQXVyb3JhIE15U1FMIENsdXN0ZXIgd2l0aCBleGlzdGluZyBjbHVzdGVyIGxvb2t1cFxuICAgIGNvbnN0IGRiQ2x1c3RlciA9IG5ldyByZHMuU2VydmVybGVzc0NsdXN0ZXIodGhpcywgJ0xhcmF2ZWxEQicsIHtcbiAgICAgIGVuZ2luZTogcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFNeXNxbCh7XG4gICAgICAgIHZlcnNpb246IHJkcy5BdXJvcmFNeXNxbEVuZ2luZVZlcnNpb24uVkVSXzNfMDNfMCxcbiAgICAgIH0pLFxuICAgICAgdnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNjYWxpbmc6IHtcbiAgICAgICAgYXV0b1BhdXNlOiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXG4gICAgICAgIG1pbkNhcGFjaXR5OiByZHMuQXVyb3JhQ2FwYWNpdHlVbml0LkFDVV8yLFxuICAgICAgICBtYXhDYXBhY2l0eTogcmRzLkF1cm9yYUNhcGFjaXR5VW5pdC5BQ1VfMTYsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdERhdGFiYXNlTmFtZTogJ2xhcmF2ZWwnLFxuICAgICAgY3JlZGVudGlhbHM6IHJkcy5DcmVkZW50aWFscy5mcm9tR2VuZXJhdGVkU2VjcmV0KCdhZG1pbicpLFxuICAgICAgYmFja3VwUmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlNOQVBTSE9ULFxuICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSxcbiAgICAgIGVuYWJsZURhdGFBcGk6IHRydWUsXG4gICAgICBjbHVzdGVySWRlbnRpZmllcjogJ2xhcmF2ZWwtZGInLCAvLyBOYW1lZCBjbHVzdGVyIGZvciBlYXNpZXIgbG9va3VwXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRUNSIFJlcG9zaXRvcnkgd2l0aCBleGlzdGluZyByZXBvc2l0b3J5IGxvb2t1cFxuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSBuZXcgZWNyLlJlcG9zaXRvcnkodGhpcywgJ0xhcmF2ZWxSZXBvc2l0b3J5Jywge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6ICdsYXJhdmVsLWFwcCcsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZUltYWdlczogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBtYXhJbWFnZUNvdW50OiA1LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBUYXNrIFJvbGUgd2l0aCBleGlzdGluZyByb2xlIGxvb2t1cFxuICAgIGNvbnN0IHRhc2tSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYXJhdmVsVGFza1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnZWNzLXRhc2tzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnbGFyYXZlbC10YXNrLXJvbGUnLCAvLyBOYW1lZCByb2xlIGZvciBlYXNpZXIgbG9va3VwXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIFNTTSBQYXJhbWV0ZXIgU3RvcmVcbiAgICB0YXNrUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydzc206R2V0UGFyYW1ldGVyJywgJ3NzbTpHZXRQYXJhbWV0ZXJzJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBZGQgcGVybWlzc2lvbnMgdG8gYWNjZXNzIENsb3VkV2F0Y2ggTG9nc1xuICAgIHRhc2tSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnLFxuICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBUYXNrIERlZmluaXRpb24gd2l0aCBleGlzdGluZyB0YXNrIGRlZmluaXRpb24gbG9va3VwXG4gICAgY29uc3QgdGFza0RlZmluaXRpb24gPSBuZXcgZWNzLkZhcmdhdGVUYXNrRGVmaW5pdGlvbih0aGlzLCAnTGFyYXZlbFRhc2snLCB7XG4gICAgICBtZW1vcnlMaW1pdE1pQjogMTAyNCxcbiAgICAgIGNwdTogNTEyLFxuICAgICAgdGFza1JvbGUsXG4gICAgICBmYW1pbHk6ICdsYXJhdmVsLXRhc2snLCAvLyBOYW1lZCBmYW1pbHkgZm9yIGVhc2llciBsb29rdXBcbiAgICB9KTtcblxuICAgIC8vIEFkZCBjb250YWluZXIgdG8gdGFza1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignTGFyYXZlbENvbnRhaW5lcicsIHtcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbUVjclJlcG9zaXRvcnkocmVwb3NpdG9yeSwgJ2xhdGVzdCcpLFxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2xhcmF2ZWwnLFxuICAgICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIERCX0NPTk5FQ1RJT046ICdteXNxbCcsXG4gICAgICAgIERCX0hPU1Q6IGRiQ2x1c3Rlci5jbHVzdGVyRW5kcG9pbnQuaG9zdG5hbWUsXG4gICAgICAgIERCX1BPUlQ6IGRiQ2x1c3Rlci5jbHVzdGVyRW5kcG9pbnQucG9ydC50b1N0cmluZygpLFxuICAgICAgICBEQl9EQVRBQkFTRTogJ2xhcmF2ZWwnLFxuICAgICAgICBEQl9VU0VSTkFNRTogJ2FkbWluJyxcbiAgICAgICAgQ0FDSEVfRFJJVkVSOiAncmVkaXMnLFxuICAgICAgICBRVUVVRV9DT05ORUNUSU9OOiAncmVkaXMnLFxuICAgICAgICBTRVNTSU9OX0RSSVZFUjogJ3JlZGlzJyxcbiAgICAgIH0sXG4gICAgICBzZWNyZXRzOiB7XG4gICAgICAgIERCX1BBU1NXT1JEOiBlY3MuU2VjcmV0LmZyb21Tc21QYXJhbWV0ZXIoXG4gICAgICAgICAgc3NtLlN0cmluZ1BhcmFtZXRlci5mcm9tU2VjdXJlU3RyaW5nUGFyYW1ldGVyQXR0cmlidXRlcyhcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICAnREJQYXNzd29yZCcsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHBhcmFtZXRlck5hbWU6ICcvbGFyYXZlbC9kYi9wYXNzd29yZCcsXG4gICAgICAgICAgICAgIHZlcnNpb246IDEsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKVxuICAgICAgICApLFxuICAgICAgICBBUFBfS0VZOiBlY3MuU2VjcmV0LmZyb21Tc21QYXJhbWV0ZXIoXG4gICAgICAgICAgc3NtLlN0cmluZ1BhcmFtZXRlci5mcm9tU2VjdXJlU3RyaW5nUGFyYW1ldGVyQXR0cmlidXRlcyhcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICAnQXBwS2V5JyxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9sYXJhdmVsL2FwcC9rZXknLFxuICAgICAgICAgICAgICB2ZXJzaW9uOiAxLFxuICAgICAgICAgICAgfVxuICAgICAgICAgIClcbiAgICAgICAgKSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcbiAgICAgIGNvbnRhaW5lclBvcnQ6IDkwMDAsXG4gICAgICBob3N0UG9ydDogOTAwMCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBBTEIgd2l0aCBleGlzdGluZyBBTEIgbG9va3VwXG4gICAgY29uc3QgYWxiID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdMYXJhdmVsQUxCJywge1xuICAgICAgdnBjLFxuICAgICAgaW50ZXJuZXRGYWNpbmc6IHRydWUsXG4gICAgICBsb2FkQmFsYW5jZXJOYW1lOiAnbGFyYXZlbC1hbGInLCAvLyBOYW1lZCBBTEIgZm9yIGVhc2llciBsb29rdXBcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBBTEIgVGFyZ2V0IEdyb3VwIHdpdGggZXhpc3RpbmcgdGFyZ2V0IGdyb3VwIGxvb2t1cFxuICAgIGNvbnN0IHRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ0xhcmF2ZWxUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIHBvcnQ6IDkwMDAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5JUCxcbiAgICAgIGhlYWx0aENoZWNrOiB7XG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMCcsXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgfSxcbiAgICAgIHRhcmdldEdyb3VwTmFtZTogJ2xhcmF2ZWwtdGcnLCAvLyBOYW1lZCB0YXJnZXQgZ3JvdXAgZm9yIGVhc2llciBsb29rdXBcbiAgICB9KTtcblxuICAgIC8vIEFkZCBsaXN0ZW5lciB0byBBTEJcbiAgICBjb25zdCBsaXN0ZW5lciA9IGFsYi5hZGRMaXN0ZW5lcignTGFyYXZlbExpc3RlbmVyJywge1xuICAgICAgcG9ydDogODAsXG4gICAgICBkZWZhdWx0VGFyZ2V0R3JvdXBzOiBbdGFyZ2V0R3JvdXBdLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVDUyBTZXJ2aWNlIHdpdGggZXhpc3Rpbmcgc2VydmljZSBsb29rdXBcbiAgICBjb25zdCBzZXJ2aWNlID0gbmV3IGVjcy5GYXJnYXRlU2VydmljZSh0aGlzLCAnTGFyYXZlbFNlcnZpY2UnLCB7XG4gICAgICBjbHVzdGVyLFxuICAgICAgdGFza0RlZmluaXRpb24sXG4gICAgICBkZXNpcmVkQ291bnQ6IDIsXG4gICAgICBtaW5IZWFsdGh5UGVyY2VudDogNTAsXG4gICAgICBtYXhIZWFsdGh5UGVyY2VudDogMjAwLFxuICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QUklWQVRFX1dJVEhfRUdSRVNTLFxuICAgICAgfSxcbiAgICAgIHNlcnZpY2VOYW1lOiAnbGFyYXZlbC1zZXJ2aWNlJywgLy8gTmFtZWQgc2VydmljZSBmb3IgZWFzaWVyIGxvb2t1cFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgdHJhZmZpYyBmcm9tIEFMQiB0byBFQ1NcbiAgICBjb25zdCBhbGJTZWN1cml0eUdyb3VwID0gbmV3IGVjMi5TZWN1cml0eUdyb3VwKHRoaXMsICdBTEJTZWN1cml0eUdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBncm91cCBmb3IgQUxCJyxcbiAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgICBzZWN1cml0eUdyb3VwTmFtZTogJ2xhcmF2ZWwtYWxiLXNnJywgLy8gTmFtZWQgc2VjdXJpdHkgZ3JvdXAgZm9yIGVhc2llciBsb29rdXBcbiAgICB9KTtcblxuICAgIHNlcnZpY2UuY29ubmVjdGlvbnMuYWxsb3dGcm9tKFxuICAgICAgYWxiU2VjdXJpdHlHcm91cCxcbiAgICAgIGVjMi5Qb3J0LnRjcCg5MDAwKSxcbiAgICAgICdBbGxvdyB0cmFmZmljIGZyb20gQUxCJ1xuICAgICk7XG5cbiAgICAvLyBBbGxvdyB0cmFmZmljIGZyb20gRUNTIHRvIEF1cm9yYVxuICAgIGRiQ2x1c3Rlci5jb25uZWN0aW9ucy5hbGxvd0Zyb20oXG4gICAgICBzZXJ2aWNlLFxuICAgICAgZWMyLlBvcnQudGNwKDMzMDYpLFxuICAgICAgJ0FsbG93IE15U1FMIGFjY2VzcyBmcm9tIEVDUydcbiAgICApO1xuXG4gICAgLy8gU3RvcmUgZGF0YWJhc2UgY3JlZGVudGlhbHMgaW4gU1NNIFBhcmFtZXRlciBTdG9yZVxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdEQlBhc3N3b3JkUGFyYW0nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiAnL2xhcmF2ZWwvZGIvcGFzc3dvcmQnLFxuICAgICAgc3RyaW5nVmFsdWU6IGRiQ2x1c3Rlci5zZWNyZXQhLnNlY3JldFZhbHVlRnJvbUpzb24oJ3Bhc3N3b3JkJykudG9TdHJpbmcoKSxcbiAgICAgIHR5cGU6IHNzbS5QYXJhbWV0ZXJUeXBlLlNFQ1VSRV9TVFJJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSBhcHBsaWNhdGlvbiBrZXkgaW4gU1NNIFBhcmFtZXRlciBTdG9yZVxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdBcHBLZXlQYXJhbScsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6ICcvbGFyYXZlbC9hcHAva2V5JyxcbiAgICAgIHN0cmluZ1ZhbHVlOiAnYmFzZTY0OicgKyBCdWZmZXIuZnJvbShyZXF1aXJlKCdjcnlwdG8nKS5yYW5kb21CeXRlcygzMikpLnRvU3RyaW5nKCdiYXNlNjQnKSxcbiAgICAgIHR5cGU6IHNzbS5QYXJhbWV0ZXJUeXBlLlNFQ1VSRV9TVFJJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIEFMQiBETlNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRE5TJywge1xuICAgICAgdmFsdWU6IGFsYi5sb2FkQmFsYW5jZXJEbnNOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdMb2FkIEJhbGFuY2VyIEROUycsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIEVDUiByZXBvc2l0b3J5IFVSSVxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFQ1JSZXBvc2l0b3J5VVJJJywge1xuICAgICAgdmFsdWU6IHJlcG9zaXRvcnkucmVwb3NpdG9yeVVyaSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNSIFJlcG9zaXRvcnkgVVJJJyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCB0aGUgQXVyb3JhIGNsdXN0ZXIgZW5kcG9pbnRcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnREJFbmRwb2ludCcsIHtcbiAgICAgIHZhbHVlOiBkYkNsdXN0ZXIuY2x1c3RlckVuZHBvaW50Lmhvc3RuYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdBdXJvcmEgQ2x1c3RlciBFbmRwb2ludCcsXG4gICAgfSk7XG4gIH1cbn0gIl19