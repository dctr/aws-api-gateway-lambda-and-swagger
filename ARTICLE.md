# TL;DR

With this article you will be able to build

* A [CORS](https://www.w3.org/TR/cors/)-enabled [serverless](https://martinfowler.com/articles/serverless.html) [microservice](https://martinfowler.com/articles/microservices.html)
* Interactive API documentation
* Continuous Integration / Deployment

With

* No own infrastructure
* [Infrastructure as code](https://www.thoughtworks.com/insights/blog/infrastructure-code-reason-smile)

Building upon

* [Amazon Web Services](https://aws.amazon.com/) (AWS)
* [Swagger](http://swagger.io/)

Code via [GitHub](https://github.com/dctr/aws-api-gateway-lambda-and-swagger).

# Introduction

Serverless architectures in microservice ecosystems are all the wiz these days. There are a few competitors out there providing cloud hosting services for these kind of infrastructures—most notably Amazon, Google and Microsoft. This article builds upon the Amazon AWS stack, briefly describing what each of the components is and introducing a "minimum viable setup". By the end of it you can not only impress your manager with a lot of buzzwords but also your tech lead with a sound technology stack proposal.

![](http://rea.tech/wp-content/uploads/GwLambda.png)

It took a while to piece together the pattern described below. The documentation regarding AWS API Gateway is incomplete as of the time of writing. Hopefully this article will serve as a quick start guide to get you up to speed.

# API Documentation

Of course, every good service should start with the API documentation to specify its scope. For REST interfaces, there are a number of approaches and tools to achieve this. Language dependent or independent, in-code or separate. Swagger works with a definition file that is maintained outside the codebase. It is written in YML (or JSON) and it's benefits include:

* It has a Web UI, which makes it simple to interact with your API
* You can use the API definition file as input to generate an AWS API Gateway.

The snippet of code below defines a single resource that returns a 200 response. This resource returns all listings for a given post

```yaml
# e.g. GET /listings?postcode=3121

swagger: '2.0'
info:
  title: My API
  description: My AWS API Gateway config
  version: '1.0.0'
schemes:
- https
basePath: /api/v1
produces:
- application/json
definitions:
  Listing:
    type: object
    properties:
      id:
        type: string
        description: Listing ID
      title:
        type: string
        description: Title of the listing.
paths:
  /listings:
    get:
      summary: Get Project Profiles
      description: |
        This endpoint returns information about listings
        with a specific post code.
      parameters:
      - name: postcode
        in: query
        description: postcode
        required: false
        type: string
      responses:
        '200':
          description: Project profiles
          schema:
            $ref: '#/definitions/Listing'
```

# Hosting the API Documentation

As mentioned before, Swagger provides an interactive web interface called SwaggerUI. It comes with an integrated REST client. SwaggerUI enables you to navigate your API documentation and interact with it through the same interface.

![](http://rea.tech/wp-content/uploads/swaggerExtensionSwaggerUI.png)

For this project, we are hosting SwaggerUI on AWS S3. S3 is a service providing a storage that can be interacted with similar to a remote file system and comes with the option of static website hosting. Each "disk" is called Bucket and a "path" within that is called Key. S3's static website capability allows us to store the swagger.yml file and serve SwaggerUI in one go.

# Infrastructure

AWS CloudFormation is a YML (or again JSON) specification to orchestrate infrastructure in AWS. Our base file includes a "Parameters" section for variables passed into the template and a "Resources" section defining the various pieces of our infrastructure.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Responsive New Homes BFF stack

Parameters:
  PVariableA:
    Type: String
    Description: A variable

Resources:
  PieceOfInfrastructure:
    Type: AWS::Identifier
    Properties:
      Foo: !Ref PVariableA
```

For the sake of brevity I will only list excerpts of the various Resources sections. Be aware that for every variable that is not a Resource within that file there has to be a definition in the Parameters section. The actual values for those will be passed in through a separate parameters file. For this article, the input parameter variables are prefixed with `P`.

# AWS Lambda

AWS Lambda is a serverless compute service that runs your code in response to events and automatically manages the underlying compute resources for you. One way to deploy Lambda code is to put it in an S3 bucket, then use CloudFormation to download it from that bucket. The Lambda requires an IAM role. In the code snippet below the role gives permission to our Lambda to write logs to CloudWatch. Every output to stdout or stderr (e.g. console.log(), thrown errors) will be written to the logs.

```yaml
LambdaFunction:
  Type: AWS::Lambda::Function
  Properties:
    Code:
      S3Bucket: !Ref PLambdaS3Bucket
      S3Key: !Ref PLambdaS3Key
    FunctionName: !Ref PLambdaName
    Handler: !Ref PLambdaHandler
    Role: !GetAtt LambdaIamRole.Arn
    Runtime: !Ref PLambdaRuntime

LambdaIamRole:
  Type: AWS::IAM::Role
  Properties:
    AssumeRolePolicyDocument:
      Statement:
      - Action:
        - sts:AssumeRole
        Effect: Allow
        Principal:
          Service:
          - lambda.amazonaws.com
      Version: '2012-10-17'
    Path: /
    Policies:
    - PolicyDocument:
        Statement:
        - Action: iam:ListAccountAliases
          Effect: Allow
          Resource: '*'
        - Action:
          - logs:CreateLogGroup
          - logs:CreateLogStream
          - logs:PutLogEvents
          Effect: Allow
          Resource: arn:aws:logs:*:*:*
        Version: '2012-10-17'
      PolicyName: PermitLambda
```

Given the template above, the application logic can be deployed. The next step is to trigger it or make it invokable. Lambdas can be invoked though a multitude of event sources of AWS infrastructure, most notably database changes or queues—and as in our case of course API Gateways, but more on that later.

# Application Logic

Needless to say that the application logic performed by your service varies widely dependent on the use case. Lambda allows for implementation in various programming languages—most notably Java, JavaScript and Python. For the purpose of this article, lets define a small JavaScript implementation that returns a simple JSON payload containing a message extracted from the query string.

```javascript
exports.handler = (event, context, callback) => {
  const message = event.querystring.input;
  callback(null, { output: message });
}
```

This function can now be ZIPped and placed into the aforementioned location in S3. This step can be performed by a continuous integration system. Later on we will see how that event object came to include the query string.

# AWS API Gateway REST API

API Gateway operates as an HTTP endpoint that can, amongst others, be an event source to a Lambda. There are various ways to configure endpoint resources (aka URL paths), but the one we are interested in here is passing it a swagger file. This can be expressed in a CloudFormation Resource.

```yaml
ApiGatewayRestApi:
  Type: AWS::ApiGateway::RestApi
  Properties:
    Name: MyApi
    Description: My AWS API Gateway config
    Body:
      # INSERT swagger.yml content here
```

In addition to defining the REST endpoints, naturally we need to tell AWS which Lambda to invoke for a given endpoint. We can do so by adding the proprietary `x-amazon-apigateway-integration` field to our swagger template. Counter-intuitively in that section we have to specify `httpMethod` as POST, sine API Gateway talks to Lambda through POST requests, regardless of what the incoming request to API Gateway was. The section `requestTemplates` allows us to specify how the incoming request parameters get transformed and passed to the Lambda. In this example we just wrap everything (including the query string) in a JSON object. That object is what gets passed as the event object into the Lambda as seen in the code above. As our service might be used as a backend (or backend for frontend) for an app hosted at a different location, we need to allow cross-origin resource sharing (CORS). This is seen in the various `Access-Control-*` fields across this Resource. Lastly, we again have to attach an IAM Role to allow our REST API. This time to allow it to invoke it's backing Lambda.

```yaml
ApiGatewayRestApi:
  Type: AWS::ApiGateway::RestApi
  Properties:
    Name: MyApi
    Description: My AWS API Gateway config
    Body:
      ### SWAGGER_START !!! DO NOT ALTER THIS LINE !!!
      swagger: '2.0'
      info:
        title: My API
        description: My AWS API Gateway config
        version: '1.0.0'
      schemes:
      - https
      basePath: /api/v1
      produces:
      - application/json
      definitions:
        Listing:
          type: object
          properties:
            id:
              type: string
              description: Listing ID
            title:
              type: string
              description: Title of the listing.
      paths:
        /listings:
          get:
            summary: Get Project Profiles
            description: |
              This endpoint returns information about listings
              with a specific state, surburb and post code.
            parameters:
            - name: postcode
              in: query
              description: postcode
              required: false
              type: string
            responses:
              '200':
                description: Project profiles
                headers:
                  Access-Control-Allow-Headers:
                    type: "string"
                  Access-Control-Allow-Methods:
                    type: "string"
                  Access-Control-Allow-Origin:
                    type: "string"
                schema:
                  $ref: '#/definitions/Listing'
            ### SWAGGER_END !!! DO NOT ALTER THIS LINE !!!
            x-amazon-apigateway-integration:
              type: aws
              responses:
                default:
                  statusCode: '200'
                  responseParameters:
                    method.response.header.Access-Control-Allow-Headers : "'Content-Type'"
                    method.response.header.Access-Control-Allow-Methods : "'*'"
                    method.response.header.Access-Control-Allow-Origin : "'*'"
              # Yes, indeed it needs to be POST!
              httpMethod: POST
              credentials: !GetAtt ApiGatewayIamRole.Arn
              requestTemplates:
                application/json: '#set($allParams = $input.params()) { #foreach($type in $allParams.keySet()) #set($params = $allParams.get($type)) "$type" : { #foreach($paramName in $params.keySet()) "$paramName" : "$util.escapeJavaScript($params.get($paramName))" #if($foreach.hasNext),#end #end } #if($foreach.hasNext),#end #end }'
              uri: !Join
              - ''
              -
                - 'arn:aws:apigateway:'
                - !Ref 'AWS::Region'
                - ':lambda:path/2015-03-31/functions/arn:aws:lambda:'
                - !Ref 'AWS::Region'
                - ':'
                - !Ref 'AWS::AccountId'
                - ':function:'
                - !Ref PLambdaName
                - '/invocations'
          options:
            summary: CORS support
            description: Enable CORS by returning correct headers
            consumes:
            - application/json
            produces:
            - application/json
            tags:
            - CORS
            x-amazon-apigateway-integration:
              type: mock
              requestTemplates:
                application/json: |
                  {
                    "statusCode" : 200
                  }
              responses:
                "default":
                  statusCode: "200"
                  responseParameters:
                    method.response.header.Access-Control-Allow-Headers : "'Content-Type'"
                    method.response.header.Access-Control-Allow-Methods : "'*'"
                    method.response.header.Access-Control-Allow-Origin : "'*'"
                  responseTemplates:
                    application/json: |
                      {}
            responses:
              '200':
                description: Default response for CORS method
                headers:
                  Access-Control-Allow-Headers:
                    type: "string"
                  Access-Control-Allow-Methods:
                    type: "string"
                  Access-Control-Allow-Origin:
                    type: "string"
      x-amazon-apigateway-request-validators:
        params-only:
          validateRequestBody: false
          validateRequestParameters: true
      x-amazon-apigateway-request-validator : params-only

ApiGatewayIamRole:
  Properties:
    AssumeRolePolicyDocument:
      Statement:
      - Action:
        - sts:AssumeRole
        Effect: Allow
        Principal:
          Service:
          - apigateway.amazonaws.com
      Version: '2012-10-17'
    Path: /
    Policies:
    - PolicyDocument:
        Statement:
        - Action:
          - lambda:InvokeFunction
          - iam:PassRole
          Effect: Allow
          Resource: '*'
      PolicyName: PermitApiGateway
  Type: AWS::IAM::Role
```

# AWS API Gateway Deployment and Stage

The "logistics" behind API Gateway requires us to define a Deployment and a Stage. It is easy to think of the Stage as the web server (e.g. Nginx or Apache), as it defines things like log level or throttling. A Deployment is a snapshot of a REST API and fixes or overrides default settings of a Stage. Lastly, an Account gives us permissions to write our logs to CloudWatch. The Stage-Deployment-mechanism allows for multiple deployments for different lifecycle stages but is beyond the concerns of this article. We only define one Deployment and Stage for our REST API.

```yaml
ApiGatewayDeployment:
  Type: AWS::ApiGateway::Deployment
  Properties:
    RestApiId:
      Ref: ApiGatewayRestApi

ApiGatewayStage:
  Type: AWS::ApiGateway::Stage
  Properties:
    StageName: latest
    Description: latest stage
    RestApiId:
      Ref: ApiGatewayRestApi
    DeploymentId:
      Ref: ApiGatewayDeployment
    MethodSettings:
      - LoggingLevel: INFO
        HttpMethod: "*"
        DataTraceEnabled: true
        ResourcePath: "/*"
        CachingEnabled: true
        CacheTtlInSeconds: 60
        MetricsEnabled: true

Account:
  Type: "AWS::ApiGateway::Account"
  Properties:
    CloudWatchRoleArn: !GetAtt ApiGatewayIamRole.Arn
```

Currently, in the setup with Swagger, the stage is not fully created by AWS through CloudFormation, so we have to execute this step manually in the web console. After everything has been deployed, go to APIs &gt; MyApi (*AWS-API-ID*) &gt; Resources &gt; / (*AWS-Resource-ID*), choose Actions &gt; Deploy API select your Stage and click Deploy.

# Continuous Integration / Deployment

Now, this part of the puzzle is arguably the one that is the most dependent on your company's way of delivering things. This example roughly outlines the way of doing it at ours and for brevity leaves out some details like different deployment environments (e.g. production and staging). The deployment process can be broken down into these parts:

* A CI environment (we use BuildKite with docker).
* A process to build delivery artifacts (we use a dev docker container).
* A process that consumes artifacts and CloudFormation and deploys to AWS (we use an ops container running Ansible).

In order to build the Lambda, the dev container has Node.js in the same version as available on AWS installed. Additionally, it has the AWS CLI tools to upload the swagger.yml file into an S3 bucket, since the ops container only deploys build artifacts to Lambda (or EC2, …). Yarn runs test and build scripts. Creating the swagger file is done quick and dirty by `grep`ping it out of the CloudFormation file. That file is than copied into the desired bucket. The ops container, amongst others, uploads the Lambda artifact into S3 and runs the CloudFormation template and parameter files to deploy everything into AWS.

# Source

The code on [GitHub](https://github.com/dctr/aws-api-gateway-lambda-and-swagger) contains:

* A nice README.md :-)
* Application logic in the usual Node.js way (index.js, packagage.json, lib/, test/, …)
* Continuous integration related files
* .buildkite/ contains a pipeline uploaded to BuildKite
* auto/ contains the scripts executed on BuildKite (e.g. to build containers)
* Dockerfile and docker-compose.yml to set up the containers
* bin/ contains the scripts executed inside the containers
* CloudFormation files in deployment/
* cloudformation.yml is the template file, comprised of snippets mostly generic to all our projects
* app_config.yml contains parameters that are most likely to change across projects

Not included is:

* SwaggerUI, which can be downloaded as ZIP from their homepage.

# Conclusion

This article gives a good starting point to deploy a serverless service, which integrates documentation as a first class citizen. The service can be useful as standalone REST API or as a backend for frontend. Thanks to CORS settings, the consuming service needs no fancy magic to make it seem that API and app are hosted on the same domain.
