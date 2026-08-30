# 🎬 Movie Picture Pipeline - End-to-End Technical Documentation

This repository provides an automated DevOps CI/CD pipeline and infrastructure environment for the **Movie Picture Catalog** application. It automates testing, linting, building, containerization, and deployment to an **AWS Elastic Kubernetes Service (EKS)** cluster using **Terraform**, **GitHub Actions**, **Amazon ECR**, and **Kubernetes Kustomize**.

---

## 📐 Architecture Overview

The system automates the build, test, containerization, and deployment of a microservices application to **Amazon Elastic Kubernetes Service (EKS)** using **GitHub Actions**, **Terraform**, **Amazon ECR**, and **Kubernetes Kustomize**.

```mermaid
graph TD
    Developer([Developer / DevOps]) -->|Git Push / Pull Request| GitHubRepo[GitHub Repository]
    
    subgraph CI_CD [GitHub Actions Pipelines]
        FrontendCI[Frontend CI: Lint & Test & Build]
        BackendCI[Backend CI: Lint & Test & Build]
        FrontendCD[Frontend CD: Lint, Test, ECR Push, EKS Deploy]
        BackendCD[Backend CD: Lint, Test, ECR Push, EKS Deploy]
    end

    GitHubRepo -->|PR against main| FrontendCI
    GitHubRepo -->|PR against main| BackendCI
    GitHubRepo -->|Push to main| FrontendCD
    GitHubRepo -->|Push to main| BackendCD

    subgraph AWS_Cloud [AWS Cloud Environment (Terraform Managed)]
        ECR_Frontend[(Amazon ECR: frontend)]
        ECR_Backend[(Amazon ECR: backend)]
        
        subgraph EKS_Cluster [AWS EKS Cluster: cluster]
            FrontendPod[Frontend Pod - React UI]
            BackendPod[Backend Pod - Flask API]
            FrontendSVC[Service: LoadBalancer - Port 80]
            BackendSVC[Service: LoadBalancer - Port 80]
        end
    end

    FrontendCD -->|Push Docker Image| ECR_Frontend
    BackendCD -->|Push Docker Image| ECR_Backend
    FrontendCD -->|Apply Manifests| FrontendPod
    BackendCD -->|Apply Manifests| BackendPod

    User([End User Browser]) -->|HTTP Request| FrontendSVC
    FrontendPod -->|REST API Calls| BackendSVC
    BackendSVC --> BackendPod
```

---

## 📁 Repository Directory Structure

```
cd12354-Movie-Picture-Pipeline/
├── .gitignore
├── README.md
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       ├── backend-cd.yml
│       ├── frontend-ci.yml
│       └── frontend-cd.yml
├── setup/
│   ├── init.sh
│   └── terraform/
│       ├── main.tf
│       ├── outputs.tf
│       ├── variables.tf
│       └── versions.tf
└── starter/
    ├── backend/
    │   ├── .flake8
    │   ├── Dockerfile
    │   ├── Pipfile
    │   ├── Pipfile.lock
    │   ├── __init__.py
    │   ├── test_app.py
    │   ├── movies/
    │   │   ├── __init__.py
    │   │   ├── movies_api.py
    │   │   └── resources.py
    │   └── k8s/
    │       ├── deployment.yaml
    │       ├── kustomization.yaml
    │       └── service.yaml
    └── frontend/
        ├── .eslintrc.js
        ├── .nvmrc
        ├── Dockerfile
        ├── package.json
        ├── package-lock.json
        ├── src/
        │   ├── App.js
        │   ├── App.css
        │   ├── index.js
        │   └── components/
        │       ├── MovieList.js
        │       └── MovieDetails.js
        └── k8s/
            ├── deployment.yaml
            ├── kustomization.yaml
            └── service.yaml
```

---

## 🏗️ 1. Terraform Infrastructure Code (`setup/terraform/`)

### 📄 `setup/terraform/main.tf`
```hcl
####################
# VPC Configuration
####################
resource "aws_vpc" "vpc" {
  tags = {
    "Name" = "udacity"
  }
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vpc.id
}

resource "aws_subnet" "public_subnet" {
  vpc_id                  = aws_vpc.vpc.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "us-east-1${var.public_az}"
  map_public_ip_on_launch = true
  tags = {
    Name = "udacity-public"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name = "public"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public_subnet.id
  route_table_id = aws_route_table.public.id
}

resource "aws_subnet" "private_subnet" {
  vpc_id            = aws_vpc.vpc.id
  availability_zone = "us-east-1${var.private_az}"
  cidr_block        = "10.0.2.0/24"
  tags = {
    Name = "udacity-private"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.vpc.id

  tags = {
    Name = "private"
  }
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private_subnet.id
  route_table_id = aws_route_table.private.id
}

###################
# ECR Repositories
###################
resource "aws_ecr_repository" "frontend" {
  name                 = "frontend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "backend" {
  name                 = "backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

################
# EKS Resources
################
resource "aws_eks_cluster" "main" {
  name     = "cluster"
  version  = var.k8s_version
  role_arn = aws_iam_role.eks_cluster.arn
  vpc_config {
    subnet_ids              = [aws_subnet.private_subnet.id, aws_subnet.public_subnet.id]
    endpoint_public_access  = var.enable_private == true ? false : true
    endpoint_private_access = true
  }
  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }
  depends_on = [aws_iam_role_policy_attachment.eks_cluster, aws_iam_role_policy_attachment.eks_service]

  lifecycle {
    ignore_changes = [version]
  }
}

resource "aws_iam_role" "eks_cluster" {
  name = "eks_cluster_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

resource "aws_iam_role_policy_attachment" "eks_service" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSServicePolicy"
  role       = aws_iam_role.eks_cluster.name
}

##################
# EKS Node Group
##################
resource "aws_eks_node_group" "main" {
  node_group_name = "udacity"
  cluster_name    = aws_eks_cluster.main.name
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = [var.enable_private == true ? aws_subnet.private_subnet.id : aws_subnet.public_subnet.id]
  instance_types  = ["t3.small"]

  scaling_config {
    desired_size = 1
    max_size     = 1
    min_size     = 1
  }

  depends_on = [
    aws_iam_role_policy_attachment.node_group_policy,
    aws_iam_role_policy_attachment.cni_policy,
    aws_iam_role_policy_attachment.ecr_policy,
  ]

  lifecycle {
    ignore_changes = [scaling_config.0.desired_size]
  }
}

resource "aws_iam_role" "node_group" {
  name               = "udacity-node-group"
  assume_role_policy = data.aws_iam_policy_document.assume_role_policy.json
}

resource "aws_iam_role_policy_attachment" "node_group_policy" {
  role       = aws_iam_role.node_group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
}

resource "aws_iam_role_policy_attachment" "cni_policy" {
  role       = aws_iam_role.node_group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
}

resource "aws_iam_role_policy_attachment" "ecr_policy" {
  role       = aws_iam_role.node_group.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

data "aws_iam_policy_document" "assume_role_policy" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

####################
# GitHub Action IAM User
####################
resource "aws_iam_user" "github_action_user" {
  name = "github-action-user"
}

resource "aws_iam_user_policy" "github_action_user_permission" {
  user   = aws_iam_user.github_action_user.name
  policy = data.aws_iam_policy_document.github_policy.json
}

data "aws_iam_policy_document" "github_policy" {
  statement {
    effect    = "Allow"
    actions   = ["ecr:*", "eks:*", "ec2:*"]
    resources = ["*"]
  }
}
```

### 📄 `setup/terraform/variables.tf`
```hcl
variable "k8s_version" {
  default = "1.29"
}

variable "enable_private" {
  default = false
}

variable "public_az" {
  type        = string
  description = "Change this to a letter a-f only if you encounter an error during setup"
  default     = "a"
}

variable "private_az" {
  type        = string
  description = "Change this to a letter a-f only if you encounter an error during setup"
  default     = "b"
}
```

### 📄 `setup/terraform/outputs.tf`
```hcl
output "frontend_ecr" {
  value = aws_ecr_repository.frontend.repository_url
}

output "backend_ecr" {
  value = aws_ecr_repository.backend.repository_url
}

output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "cluster_version" {
  value = aws_eks_cluster.main.version
}

output "github_action_user_arn" {
  value = aws_iam_user.github_action_user.arn
}
```

---

## 🔑 2. IAM & EKS Access Initialization Script (`setup/init.sh`)

```bash
#!/bin/bash
set -e -o pipefail

echo "Fetching IAM github-action-user ARN"
userarn=$(aws iam get-user --user-name github-action-user --query "User.Arn" --output text)

echo "User ARN: ${userarn}"
echo "Adding github-action-user to EKS Cluster Access Entries..."
aws eks create-access-entry --cluster-name cluster --principal-arn "${userarn}" --type STANDARD --region us-east-1 || true
aws eks associate-access-policy --cluster-name cluster --principal-arn "${userarn}" --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy --access-scope type=cluster --region us-east-1 || true

echo "Done!"
```

---

## ⚡ 3. GitHub Actions Workflows (`.github/workflows/`)

### 📄 `.github/workflows/frontend-ci.yml`
```yaml
name: Frontend CI

on:
  pull_request:
    branches:
      - main
    paths:
      - "starter/frontend/**"
  workflow_dispatch:

jobs:
  lint:
    name: Frontend Lint
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/frontend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: starter/frontend/.nvmrc
          cache: npm
          cache-dependency-path: starter/frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run lint
        run: npm run lint

  test:
    name: Frontend Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/frontend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: starter/frontend/.nvmrc
          cache: npm
          cache-dependency-path: starter/frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --watchAll=false
        env:
          CI: true

  build:
    name: Frontend Build
    runs-on: ubuntu-latest
    needs:
      - lint
      - test
    defaults:
      run:
        working-directory: starter/frontend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: starter/frontend/.nvmrc
          cache: npm
          cache-dependency-path: starter/frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Build production bundle
        run: npm run build
```

### 📄 `.github/workflows/frontend-cd.yml`
```yaml
name: Frontend CD

on:
  push:
    branches:
      - main
    paths:
      - "starter/frontend/**"
  workflow_dispatch:

jobs:
  lint:
    name: Frontend Lint
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/frontend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: starter/frontend/.nvmrc
          cache: npm
          cache-dependency-path: starter/frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run lint
        run: npm run lint

  test:
    name: Frontend Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/frontend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: starter/frontend/.nvmrc
          cache: npm
          cache-dependency-path: starter/frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --watchAll=false
        env:
          CI: true

  build-and-push:
    name: Build and Push Docker Image
    runs-on: ubuntu-latest
    needs:
      - lint
      - test

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Get Backend LoadBalancer Host
        id: get-backend-url
        run: |
          aws eks update-kubeconfig --name cluster --region us-east-1
          BACKEND_HOST=$(kubectl get svc backend -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
          if [ -z "$BACKEND_HOST" ]; then
            BACKEND_HOST="ad54d235eff574475a1b293c49b0987d-1253446804.us-east-1.elb.amazonaws.com"
          fi
          echo "backend_url=http://${BACKEND_HOST}" >> $GITHUB_OUTPUT

      - name: Build Docker image
        working-directory: starter/frontend
        run: |
          docker build \
            --build-arg REACT_APP_MOVIE_API_URL=${{ steps.get-backend-url.outputs.backend_url }} \
            --tag frontend:${{ github.sha }} \
            .

      - name: Tag and push image
        run: |
          docker tag frontend:${{ github.sha }} ${{ steps.login-ecr.outputs.registry }}/frontend:${{ github.sha }}
          docker push ${{ steps.login-ecr.outputs.registry }}/frontend:${{ github.sha }}
          docker tag frontend:${{ github.sha }} ${{ steps.login-ecr.outputs.registry }}/frontend:latest
          docker push ${{ steps.login-ecr.outputs.registry }}/frontend:latest

  deploy:
    name: Deploy Frontend to Kubernetes
    runs-on: ubuntu-latest
    needs: build-and-push

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Setup kubectl
        uses: azure/setup-kubectl@v4

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name cluster --region us-east-1

      - name: Install kustomize
        run: |
          curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
          sudo mv kustomize /usr/local/bin/

      - name: Deploy frontend manifest
        working-directory: starter/frontend/k8s
        run: |
          kustomize edit set image frontend=${{ steps.login-ecr.outputs.registry }}/frontend:${{ github.sha }}
          kustomize build | kubectl apply -f -
```

### 📄 `.github/workflows/backend-ci.yml`
```yaml
name: Backend CI

on:
  pull_request:
    branches:
      - main
    paths:
      - "starter/backend/**"
  workflow_dispatch:

jobs:
  lint:
    name: Backend Lint
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/backend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Install Pipenv
        run: |
          python -m pip install --upgrade pip
          pip install pipenv

      - name: Install dependencies
        run: pipenv install --dev

      - name: Run lint
        run: pipenv run flake8 .
        env:
          PYTHONPATH: .

  test:
    name: Backend Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/backend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Install Pipenv
        run: |
          python -m pip install --upgrade pip
          pip install pipenv

      - name: Install dependencies
        run: pipenv install --dev

      - name: Run tests
        run: pipenv run pytest
        env:
          PYTHONPATH: .

  build:
    name: Backend Build
    runs-on: ubuntu-latest
    needs:
      - lint
      - test
    defaults:
      run:
        working-directory: starter/backend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Install Pipenv
        run: |
          python -m pip install --upgrade pip
          pip install pipenv

      - name: Install dependencies
        run: pipenv install --dev

      - name: Build Docker image
        run: docker build --tag backend:${{ github.sha }} .
```

### 📄 `.github/workflows/backend-cd.yml`
```yaml
name: Backend CD

on:
  push:
    branches:
      - main
    paths:
      - "starter/backend/**"
  workflow_dispatch:

jobs:
  lint:
    name: Backend Lint
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/backend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Install Pipenv
        run: |
          python -m pip install --upgrade pip
          pip install pipenv

      - name: Install dependencies
        run: pipenv install --dev

      - name: Run lint
        run: pipenv run flake8 .
        env:
          PYTHONPATH: .

  test:
    name: Backend Test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: starter/backend
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      - name: Install Pipenv
        run: |
          python -m pip install --upgrade pip
          pip install pipenv

      - name: Install dependencies
        run: pipenv install --dev

      - name: Run tests
        run: pipenv run pytest
        env:
          PYTHONPATH: .

  build-and-push:
    name: Build and Push Backend Image
    runs-on: ubuntu-latest
    needs:
      - lint
      - test
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build Docker image
        working-directory: starter/backend
        run: docker build --tag backend:${{ github.sha }} .

      - name: Tag and push image
        run: |
          docker tag backend:${{ github.sha }} ${{ steps.login-ecr.outputs.registry }}/backend:${{ github.sha }}
          docker push ${{ steps.login-ecr.outputs.registry }}/backend:${{ github.sha }}
          docker tag backend:${{ github.sha }} ${{ steps.login-ecr.outputs.registry }}/backend:latest
          docker push ${{ steps.login-ecr.outputs.registry }}/backend:latest

  deploy:
    name: Deploy Backend to Kubernetes
    runs-on: ubuntu-latest
    needs: build-and-push
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Setup kubectl
        uses: azure/setup-kubectl@v4

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name cluster --region us-east-1

      - name: Install kustomize
        run: |
          curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
          sudo mv kustomize /usr/local/bin/

      - name: Deploy backend manifest
        working-directory: starter/backend/k8s
        run: |
          kustomize edit set image backend=${{ steps.login-ecr.outputs.registry }}/backend:${{ github.sha }}
          kustomize build | kubectl apply -f -
```

---

## ☸️ 4. Kubernetes Manifests & Kustomize Files

### Backend (`starter/backend/k8s/`)

#### `deployment.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  labels:
    app: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: backend
          ports:
            - containerPort: 5000
```

#### `service.yaml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  labels:
    app: backend
spec:
  type: LoadBalancer
  selector:
    app: backend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 5000
```

#### `kustomization.yaml`
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - service.yaml
  - deployment.yaml
namespace: default
```

### Frontend (`starter/frontend/k8s/`)

#### `deployment.yaml`
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  labels:
    app: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: frontend
          ports:
            - containerPort: 3000
```

#### `service.yaml`
```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  labels:
    app: frontend
spec:
  type: LoadBalancer
  selector:
    app: frontend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
```

#### `kustomization.yaml`
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - service.yaml
  - deployment.yaml
namespace: default
```

---

## 🐍 5. Backend Application Code (`starter/backend/`)

### 📄 `starter/backend/Dockerfile`
```dockerfile
FROM python:3.10-slim-bullseye

ENV FLASK_APP=__init__.py
ENV FLASK_RUN_HOST=0.0.0.0
ENV FLASK_RUN_PORT=5000
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      gcc \
      libffi-dev \
      libssl-dev \
      libpcre3 \
      libpcre3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip pipenv

COPY Pipfile Pipfile.lock ./
RUN pipenv install --system --deploy --dev

COPY . .

RUN useradd --create-home --uid 1000 app && \
    chown -R app:app /app

USER app

EXPOSE 5000

CMD ["python", "__init__.py"]
```

### 📄 `starter/backend/test_app.py`
```python
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from __init__ import app  # noqa: E402


def test_movies_endpoint_returns_200():
    with app.test_client() as client:
        status_code = os.getenv("FAIL_TEST", 200)
        response = client.get("/movies/")
        assert response.status_code == status_code


def test_movies_endpoint_returns_json():
    with app.test_client() as client:
        response = client.get("/movies/")
        assert response.content_type == "application/json"


def test_movies_endpoint_returns_valid_data():
    with app.test_client() as client:
        response = client.get("/movies/")
        data = response.get_json()
        assert isinstance(data, dict)
        assert "movies" in data
        assert isinstance(data.get("movies"), list)
        assert len(data["movies"]) > 0
        assert "title" in data["movies"][0]
```

---

## ⚛️ 6. Frontend Application Code (`starter/frontend/`)

### 📄 `starter/frontend/Dockerfile`
```dockerfile
FROM public.ecr.aws/docker/library/node:18.14.2-alpine3.17

ARG REACT_APP_MOVIE_API_URL=http://ad54d235eff574475a1b293c49b0987d-1253446804.us-east-1.elb.amazonaws.com
ENV REACT_APP_MOVIE_API_URL=${REACT_APP_MOVIE_API_URL}

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npx", "serve", "-s", "build", "-l", "3000"]
```

---

## 🛠️ 7. Operational & Cleanup Commands Guide

### Provision AWS Infrastructure
```bash
cd setup/terraform
terraform init
terraform apply -auto-approve
```

### Initialize EKS Access
```bash
cd setup
bash init.sh
aws eks update-kubeconfig --name cluster --region us-east-1
kubectl get nodes
```

### Clean Resource Deletion (Tear Down)
```bash
# Delete Kubernetes services and LoadBalancers
kubectl delete -k starter/frontend/k8s/
kubectl delete -k starter/backend/k8s/

# Destroy AWS resources
cd setup/terraform
terraform destroy --auto-approve
```
