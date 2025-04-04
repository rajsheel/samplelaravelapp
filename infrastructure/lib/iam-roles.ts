import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class LaravelIamRoles extends Construct {
  public readonly phpTaskRole: iam.Role;
  public readonly nginxTaskRole: iam.Role;

  constructor(scope: Construct, id: string, props: { account: string; region: string }) {
    super(scope, id);

    // Create IAM role for PHP-FPM task with minimum required permissions
    this.phpTaskRole = new iam.Role(this, 'LaravelPhpTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM role for Laravel PHP-FPM task',
    });

    // Add permissions to read SSM parameters
    this.phpTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ssm:GetParameter',
          'ssm:GetParameters',
        ],
        resources: [
          `arn:aws:ssm:${props.region}:${props.account}:parameter/${props.account}/prod/*`,
        ],
      })
    );

    // Add permissions to write CloudWatch logs
    this.phpTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      })
    );

    // Create IAM role for Nginx task with minimum required permissions
    this.nginxTaskRole = new iam.Role(this, 'LaravelNginxTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'IAM role for Laravel Nginx task',
    });

    // Add permissions to write CloudWatch logs
    this.nginxTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      })
    );
  }
} 