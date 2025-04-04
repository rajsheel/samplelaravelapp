#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to check if a resource exists
check_resource_exists() {
    local resource_type=$1
    local resource_name=$2
    local check_command=$3

    echo -e "${YELLOW}Checking if $resource_type '$resource_name' exists...${NC}"
    if eval "$check_command" > /dev/null 2>&1; then
        echo -e "${GREEN}$resource_type '$resource_name' exists${NC}"
        return 0
    else
        echo -e "${YELLOW}$resource_type '$resource_name' does not exist${NC}"
        return 1
    fi
}

# Check AWS credentials
echo -e "${YELLOW}Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}AWS credentials are not configured. Please configure them first.${NC}"
    exit 1
fi

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=${AWS_REGION:-us-east-1}

# Check if CDK is bootstrapped
echo -e "${YELLOW}Checking if CDK is bootstrapped...${NC}"
if ! check_resource_exists "CDK bootstrap" "bootstrap" "aws cloudformation describe-stacks --stack-name CDKToolkit"; then
    echo -e "${YELLOW}Bootstrapping CDK...${NC}"
    cd infrastructure
    npm run cdk bootstrap
    cd ..
fi

# Check if VPC exists
if ! check_resource_exists "VPC" "laravel-vpc" "aws ec2 describe-vpcs --filters Name=tag:Name,Values=laravel-vpc"; then
    echo -e "${YELLOW}VPC will be created during deployment${NC}"
fi

# Check if ECS cluster exists
if ! check_resource_exists "ECS cluster" "laravel-cluster" "aws ecs describe-clusters --clusters laravel-cluster"; then
    echo -e "${YELLOW}ECS cluster will be created during deployment${NC}"
fi

# Check if Aurora cluster exists
if ! check_resource_exists "Aurora cluster" "laravel-db" "aws rds describe-db-clusters --db-cluster-identifier laravel-db"; then
    echo -e "${YELLOW}Aurora cluster will be created during deployment${NC}"
fi

# Deploy infrastructure
echo -e "${YELLOW}Deploying infrastructure...${NC}"
cd infrastructure
npm install
npm run build
npm run cdk deploy -- --require-approval never

# Wait for resources to be ready
echo -e "${YELLOW}Waiting for resources to be ready...${NC}"

# Wait for Aurora cluster
echo -e "${YELLOW}Waiting for Aurora cluster to be available...${NC}"
aws rds wait db-cluster-available --db-cluster-identifier laravel-db

# Wait for ECS service to be stable
echo -e "${YELLOW}Waiting for ECS service to be stable...${NC}"
aws ecs wait services-stable \
    --cluster laravel-cluster \
    --services laravel-service

# Get outputs
echo -e "${YELLOW}Getting stack outputs...${NC}"
LOAD_BALANCER_DNS=$(aws cloudformation describe-stacks \
    --stack-name LaravelStack \
    --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
    --output text)

ECR_REPOSITORY_URI=$(aws cloudformation describe-stacks \
    --stack-name LaravelStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryURI`].OutputValue' \
    --output text)

DB_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name LaravelStack \
    --query 'Stacks[0].Outputs[?OutputKey==`DBEndpoint`].OutputValue' \
    --output text)

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${GREEN}Load Balancer DNS: ${LOAD_BALANCER_DNS}${NC}"
echo -e "${GREEN}ECR Repository URI: ${ECR_REPOSITORY_URI}${NC}"
echo -e "${GREEN}Database Endpoint: ${DB_ENDPOINT}${NC}" 