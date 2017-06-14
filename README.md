# Serverless REST App on AWS

This is a stencil for deploying an AWS API Gateway with a backing lambda using Swagger for both AWS CloudFormation as well as providing API documentation.

Besides this repo, you need to set up an S3 bucket into which `./bin/deploy-api` can upload the api.yml into. Download Swagger UI, alter index.html to point to this file (e.g. `/files/api.yml`) and upload it into the same S3 bucket.

See the corresponding article for further information.
