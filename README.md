# ECS Task Deploy

A script to increment an active task definition on [ECS](https://aws.amazon.com/ecs) with an updated Docker image, followed by a service update to use it.

Sequence of steps performed by the script:

1. Download the active task definition of an ECS service.
1. Clone it.
1. Given the Docker image name provided, find *any* containers in the task definition with references to it and replace them with the new one. Docker tags are ignored when searching for a match.
1. Register this new task definition with ECS.
1. Update the service to use this new task definition, triggering a blue/green deployment.

#### Usage

    ecs-task-deploy [options]

    Options:

    -h, --help                output usage information
    -V, --version             output the version number
    -k, --aws-access-key <k>  aws access key, or via AWS_ACCESS_KEY_ID env variable
    -s, --aws-secret-key <k>  aws secret key, or via AWS_SECRET_ACCESS_KEY env variable
    -r, --region <r>          aws region, or via AWS_DEFAULT_REGION env variable.
    -c, --cluster <c>         ecs cluster, or via AWS_ECS_CLUSTER env variable
    -n, --service <n>         ecs service, or via AWS_ECS_SERVICE_NAME env variable
    -i, --image <i>           docker image for task definition, or via AWS_ECS_TASK_IMAGE env variable
    -t, --timeout <t>         max timeout (sec) for ECS service to launch new task, defaults to 90s
    -v, --verbose             enable verbose mode

##### Node

To run via cli.

    npm install -g ecs-task-deploy
    
```javascript
ecs-task-deploy \
    -k 'ABCD'
    -s 'SECRET'
    -r 'us-west-1'
    -c 'qa' \
    -n 'website-service' \
    -i '44444444.ddd.ecr.us-east-1.amazonaws.com/website:1.0.2'
```

To run in code.

    npm install ecs-task-deploy --save

```javascript
const ecsTaskDeploy = require('ecs-task-deploy')

ecsTaskDeploy({
  awsAccessKey: 'ABCD',
  awsSecretKey: 'SECRET',
  region: 'us-east-1'
  cluster: 'cache-cluster',
  service: 'cache-service',
  image: 'redis:2.8'
})
.then(
  taskDef => console.info(`Task '${newTask.taskDefinitionArn}' created and deployed`), 
  e => console.error(e)
)
```

##### Docker

Run with arguments.

    docker run --rm stead/ecs-task-deploy \
        -k <key>
        -s <secret>
        -r <region>
        -c <cluster> \
        -n <service-name> \
        -i <image-name>

Run with standard AWS environment variables.

    docker run --rm \
        -e AWS_DEFAULT_REGION=<region>  \
        -e AWS_ACCESS_KEY_ID=<key> \
        -e AWS_SECRET_ACCESS_KEY=<secret>  \
        stead/ecs-task-deploy \
        -c <cluster> \
        -n <service-name> \
        -i <image-name>
