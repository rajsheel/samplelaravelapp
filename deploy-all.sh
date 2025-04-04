#!/bin/bash

# Exit on error
set -e

# Deploy infrastructure
echo "Deploying infrastructure..."
cd infrastructure
npm install
npm run build
npm run deploy

# Get the ECR repository URI from the CDK output
ECR_REPO=$(aws cloudformation describe-stacks --stack-name LaravelStack --query 'Stacks[0].Outputs[?OutputKey==`RepositoryURI`].OutputValue' --output text)

# Build and push the Docker image
echo "Building and pushing Docker image..."
cd ..
docker build -t ${ECR_REPO}:latest -f Dockerfile.prod .
aws ecr get-login-password --region $(aws configure get region) | docker login --username AWS --password-stdin ${ECR_REPO}
docker push ${ECR_REPO}:latest

# Update the ECS service to force new deployment
echo "Updating ECS service..."
aws ecs update-service --cluster laravel-cluster --service LaravelService --force-new-deployment

echo "Deployment complete! The application will be available at:"
aws cloudformation describe-stacks --stack-name LaravelStack --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' --output text 