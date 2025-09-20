FROM mcr.microsoft.com/devcontainers/typescript-node:18

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspaces/lab-pong-tracker
