#!/bin/bash
set -e -o pipefail

echo "Fetching IAM github-action-user ARN"
userarn=$(aws iam get-user --user-name github-action-user --query "User.Arn" --output text)

echo "User ARN: ${userarn}"
echo "Adding github-action-user to EKS Cluster Access Entries..."
aws eks create-access-entry --cluster-name cluster --principal-arn "${userarn}" --type STANDARD --region us-east-1 || true
aws eks associate-access-policy --cluster-name cluster --principal-arn "${userarn}" --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy --access-scope type=cluster --region us-east-1 || true

echo "Done!"