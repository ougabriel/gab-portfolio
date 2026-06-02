# AZURE PROJECT: Real-time IoT analytics platform with Event Hubs, Stream Analytics, Cosmos DB, and Power BI, all CI/CD

Every manufacturer and logistics company I have worked with ends up building the same pipeline. Sensors emit telemetry, telemetry hits a managed broker, a stream processor runs SQL over the moving data, results land in a database and in a streaming dataset for the dashboard on the wall. We are going to build that exact pipeline on Azure, end to end, with Bicep for the infra, an `asaproj` Stream Analytics project committed to git, and an Azure DevOps pipeline that promotes the job query from dev to prod after a reference-data test passes.

## Tools used

- **Azure IoT Hub** (`Microsoft.Devices/IotHubs`): the device-facing ingestion endpoint. Handles device identity, MQTT/AMQP, and message routing to downstream Event Hubs.
- **Azure Event Hubs** (`Microsoft.EventHub/namespaces`): fully managed event streaming platform with native Apache Kafka compatibility. Supports AMQP 1.0 and HTTPS. Up to 7 days retention on Standard, 90 days on Premium/Dedicated.
- **Azure Stream Analytics** (`Microsoft.StreamAnalytics/streamingjobs`): managed stream processing engine with SQL-augmented temporal queries, TUMBLINGWINDOW + HOPPINGWINDOW + SLIDINGWINDOW + SESSIONWINDOW + SNAPSHOTWINDOW, and built-in `AnomalyDetection_SpikeAndDip` and `AnomalyDetection_ChangePoint` functions.
- **Azure Cosmos DB for NoSQL** (`Microsoft.DocumentDB/databaseAccounts`): single-digit millisecond NoSQL store with autoscale RU/s, change feed, and analytical store via Synapse Link.
- **Power BI streaming dataset**: the live tile target. Stream Analytics pushes JSON rows, Power BI renders them on the dashboard with sub-second latency.
- **Azure Monitor**: metric alerts on the anomaly count so the on-call gets paged when something drifts.
- **Bicep + Azure DevOps Pipelines**: infra and job query as code, ADO YAML pipeline does the deploy.
- **Visual Studio Code with the Azure Stream Analytics extension**: produces the `asaproj` project format that the CLI deploys.

## Prerequisites

- An Azure subscription with Contributor on a target resource group.
- Azure CLI 2.61.0 or higher, plus the `streamanalytics` and `iot` extensions: `az extension add --name streamanalytics && az extension add --name azure-iot`.
- Bicep CLI 0.27 or higher (bundled with recent `az`).
- An Azure DevOps organisation, a project, and a self-hosted or Microsoft-hosted agent pool. The `windows-latest` and `ubuntu-latest` hosted images both work.
- A Power BI Pro or Premium Per User licence on the workspace you will push to. The streaming dataset is created by Stream Analytics itself on first run, you only need the workspace ID.
- A service principal with `Contributor` on the resource group, registered as an ADO service connection called `azure-iot-prod`.
- Familiarity with reading JSON, writing T-SQL, and not panicking when an ARM deployment says `ConflictingOperation` on the first try.

## Project Architecture

Factory devices on the floor each ship a JSON payload every second over MQTT to IoT Hub, like `{"deviceId":"press-07","temperature":78.4,"vibration":0.21,"ts":"2026-06-02T08:00:00Z"}`. IoT Hub routes the messages to an Event Hubs instance partitioned by `deviceId`, so all events from the same press land in the same partition and the order is preserved. A Stream Analytics job reads that Event Hub, runs a 30-second TUMBLINGWINDOW averaging per device, runs `AnomalyDetection_SpikeAndDip` over the temperature stream, and writes two outputs. Output one is the raw aggregate to Cosmos DB partitioned by `/deviceId`. Output two is the anomaly rows to a Power BI streaming dataset. Azure Monitor fires an alert when anomalies cross a threshold. ADO Pipelines deploys infra first, then the ASA job query, runs a reference-data test against a captured sample, promotes to prod.

## Step 1. Bicep template for the streaming infra

Create a file `infra/main.bicep` and paste the following. This stands up the IoT Hub, the Event Hubs namespace and hub, the Cosmos DB account with analytical store enabled, and an empty Stream Analytics job that the pipeline will fill in later.

```bicep
@description('Environment short name, dev or prod')
param env string

@description('Azure region')
param location string = resourceGroup().location

@description('Event Hubs SKU tier')
@allowed([ 'Standard', 'Premium' ])
param ehSku string = 'Standard'

@description('Throughput Units for the Event Hubs namespace, 1 to 20 for Standard')
@minValue(1)
@maxValue(20)
param throughputUnits int = 2

var iotHubName = 'iot-factory-${env}'
var ehNamespace = 'ehns-factory-${env}'
var ehName = 'telemetry'
var cosmosName = 'cosmos-factory-${env}'
var asaJobName = 'asa-factory-${env}'

resource iotHub 'Microsoft.Devices/IotHubs@2023-06-30' = {
  name: iotHubName
  location: location
  sku: {
    name: 'S1'
    capacity: 1
  }
  properties: {
    routing: {
      endpoints: {
        eventHubs: [
          {
            name: 'ehTelemetry'
            connectionString: listKeys('${ehNamespace}/RootManageSharedAccessKey', '2024-01-01').primaryConnectionString
            resourceGroup: resourceGroup().name
            subscriptionId: subscription().subscriptionId
          }
        ]
      }
      routes: [
        {
          name: 'telemetryToEventHub'
          source: 'DeviceMessages'
          condition: 'true'
          endpointNames: [ 'ehTelemetry' ]
          isEnabled: true
        }
      ]
      fallbackRoute: {
        name: '$fallback'
        source: 'DeviceMessages'
        condition: 'true'
        endpointNames: [ 'events' ]
        isEnabled: true
      }
    }
  }
  dependsOn: [ eventHub ]
}

resource ehNs 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: ehNamespace
  location: location
  sku: {
    name: ehSku
    tier: ehSku
    capacity: throughputUnits
  }
  properties: {
    isAutoInflateEnabled: true
    maximumThroughputUnits: 10
    zoneRedundant: true
  }
}

resource eventHub 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = {
  parent: ehNs
  name: ehName
  properties: {
    partitionCount: 8
    messageRetentionInDays: 3
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableAnalyticalStorage: true
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: true
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'factoryTelemetry'
  properties: {
    resource: { id: 'factoryTelemetry' }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDb
  name: 'aggregates'
  properties: {
    resource: {
      id: 'aggregates'
      partitionKey: {
        paths: [ '/deviceId' ]
        kind: 'Hash'
      }
      analyticalStorageTtl: -1
    }
  }
}

resource asaJob 'Microsoft.StreamAnalytics/streamingjobs@2021-10-01-preview' = {
  name: asaJobName
  location: location
  properties: {
    sku: { name: 'StandardV2' }
    eventsOutOfOrderPolicy: 'Adjust'
    eventsOutOfOrderMaxDelayInSeconds: 10
    eventsLateArrivalMaxDelayInSeconds: 60
    outputErrorPolicy: 'Drop'
    compatibilityLevel: '1.2'
  }
}

output ehNamespaceId string = ehNs.id
output cosmosAccountName string = cosmos.name
output asaJobName string = asaJob.name
```

A note on Cosmos partition key. `/deviceId` is the right pick because the workload is write-heavy and queries are almost always `WHERE deviceId = ?`. Low cardinality like `/factoryId` gives you fat physical partitions and a 429 storm. High cardinality like `/messageId` kills the ability to query a device's history without a cross-partition fan-out. Device ID is the goldilocks choice.

## Step 2: Deploy the infra with az CLI

Run the following commands to deploy the Bicep stack into a fresh resource group.

```powershell
az group create --name rg-iot-dev --location uksouth
az deployment group create `
  --resource-group rg-iot-dev `
  --template-file infra/main.bicep `
  --parameters env=dev location=uksouth ehSku=Standard throughputUnits=2
```

Standard tier Event Hubs gives 1 MB/s ingress and 2 MB/s egress per TU, with auto-inflate it scales to 10 TU when the press lines spool up. Premium has Processing Units (PU) instead of TU, with tenant isolation plus 90 days retention. PU is right for predictable capacity, TU is right for the cheapest burst-friendly option.

## Step 3. Write the Stream Analytics query as code

Inside the repo create `asa/factory.asaproj`, `asa/Inputs/telemetryInput.json`, `asa/Outputs/cosmosOut.json`, `asa/Outputs/powerbiOut.json`, and the query itself in `asa/factoryQuery.asaql`.

Below is the YAML for `asa/factory.asaproj` (it is XML actually, that is the format Visual Studio Code emits):

```xml
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="2.0" DefaultTargets="Build">
  <PropertyGroup>
    <ProjectGuid>{8c4d8b1f-1a3e-4f7d-aa12-2b8e9f1234ab}</ProjectGuid>
    <OutputType>StreamAnalyticsJob</OutputType>
    <Name>factory</Name>
    <CompatibilityLevel>1.2</CompatibilityLevel>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="factoryQuery.asaql" />
    <Content Include="Inputs\telemetryInput.json" />
    <Content Include="Outputs\cosmosOut.json" />
    <Content Include="Outputs\powerbiOut.json" />
    <Content Include="JobConfig.json" />
  </ItemGroup>
</Project>
```

Paste the following into `asa/factoryQuery.asaql`. This is the actual query that runs in production.

```sql
WITH DeviceTelemetry AS (
    SELECT
        deviceId,
        temperature,
        vibration,
        pressure,
        CAST(ts AS datetime) AS eventTs,
        EventEnqueuedUtcTime AS enqueuedTs
    FROM telemetryInput TIMESTAMP BY ts PARTITION BY deviceId
),
Aggregates AS (
    SELECT
        deviceId,
        AVG(temperature) AS avgTemp,
        MAX(temperature) AS maxTemp,
        AVG(vibration) AS avgVibration,
        COUNT(*) AS samples,
        System.Timestamp() AS windowEnd
    FROM DeviceTelemetry
    GROUP BY deviceId, TumblingWindow(second, 30)
),
Anomalies AS (
    SELECT
        deviceId,
        temperature,
        eventTs,
        AnomalyDetection_SpikeAndDip(temperature, 95, 120, 'spikesanddips')
            OVER (PARTITION BY deviceId LIMIT DURATION(minute, 2)) AS anomaly
    FROM DeviceTelemetry
)
SELECT
    deviceId,
    avgTemp,
    maxTemp,
    avgVibration,
    samples,
    windowEnd
INTO cosmosOut
FROM Aggregates;

SELECT
    deviceId,
    temperature,
    eventTs,
    CAST(GetRecordPropertyValue(anomaly, 'Score') AS float) AS anomalyScore,
    CAST(GetRecordPropertyValue(anomaly, 'IsAnomaly') AS bigint) AS isAnomaly
INTO powerbiOut
FROM Anomalies
WHERE CAST(GetRecordPropertyValue(anomaly, 'IsAnomaly') AS bigint) = 1;
```

A few things to call out. `TIMESTAMP BY ts` tells ASA to use the device clock, not the broker arrival time. `PARTITION BY deviceId` lines up with the Event Hub partition key, that is what gets you parallelism on the streaming nodes. `TumblingWindow(second, 30)` gives discrete non-overlapping 30-second buckets. `AnomalyDetection_SpikeAndDip` runs a sliding 2-minute model with a 95 confidence band, 120 history points; drop the confidence band for louder alerts.

Paste the following into `asa/Inputs/telemetryInput.json`:

```json
{
  "Name": "telemetryInput",
  "Type": "Stream",
  "DataSource": {
    "Type": "Microsoft.ServiceBus/EventHub",
    "Properties": {
      "serviceBusNamespace": "ehns-factory-dev",
      "eventHubName": "telemetry",
      "consumerGroupName": "$Default",
      "authenticationMode": "Msi"
    }
  },
  "Serialization": {
    "Type": "Json",
    "Properties": { "Encoding": "UTF8" }
  }
}
```

Paste the following into `asa/Outputs/cosmosOut.json`:

```json
{
  "Name": "cosmosOut",
  "DataSource": {
    "Type": "Microsoft.Storage/DocumentDB",
    "Properties": {
      "accountId": "cosmos-factory-dev",
      "database": "factoryTelemetry",
      "collectionNamePattern": "aggregates",
      "partitionKey": "deviceId",
      "authenticationMode": "Msi"
    }
  }
}
```

And `asa/Outputs/powerbiOut.json`:

```json
{
  "Name": "powerbiOut",
  "DataSource": {
    "Type": "PowerBI",
    "Properties": {
      "dataset": "factory-anomalies",
      "table": "anomalies",
      "groupId": "<your-powerbi-workspace-guid>",
      "groupName": "Factory Ops",
      "authenticationMode": "ConnectionString"
    }
  }
}
```

## Step 4: Reference data for the test stage

Create `asa/refdata/devices.json` with a small set of known devices and their thresholds. The pipeline will mount this as a reference input during the test stage and the query gets validated against it.

```json
[
  { "deviceId": "press-07", "tempMax": 110.0, "vibrationMax": 0.9 },
  { "deviceId": "press-08", "tempMax": 105.0, "vibrationMax": 0.8 },
  { "deviceId": "weld-12",  "tempMax": 220.0, "vibrationMax": 1.4 }
]
```

Also commit `asa/testdata/sample_telemetry.json`, a captured 1-minute slice of real device events. The ADO test stage replays this through the ASA job in test mode and asserts the expected aggregate rows come out.

## Step 5: Build the Azure DevOps pipeline

Paste the following into `azure-pipelines.yml` at the repo root.

```yaml
trigger:
  branches:
    include: [ main ]
  paths:
    include: [ infra/*, asa/* ]

variables:
  azureServiceConnection: 'azure-iot-prod'
  rgDev: 'rg-iot-dev'
  rgProd: 'rg-iot-prod'
  location: 'uksouth'
  asaJobDev: 'asa-factory-dev'
  asaJobProd: 'asa-factory-prod'

stages:
- stage: Validate
  displayName: Validate Bicep and ASA project
  jobs:
  - job: lint
    pool: { vmImage: 'ubuntu-latest' }
    steps:
    - task: AzureCLI@2
      displayName: bicep build
      inputs:
        azureSubscription: $(azureServiceConnection)
        scriptType: bash
        scriptLocation: inlineScript
        inlineScript: |
          az bicep build --file infra/main.bicep
    - task: UseNode@1
      inputs: { version: '20.x' }
    - script: |
        npm install -g azure-streamanalytics-cicd@3.0.0
        azure-streamanalytics-cicd build --project asa/factory.asaproj --outputPath ./asa-out
      displayName: ASA project build

- stage: DeployDev
  displayName: Deploy to dev
  dependsOn: Validate
  jobs:
  - deployment: deployDev
    environment: iot-dev
    pool: { vmImage: 'ubuntu-latest' }
    strategy:
      runOnce:
        deploy:
          steps:
          - checkout: self
          - task: AzureCLI@2
            displayName: bicep deploy
            inputs:
              azureSubscription: $(azureServiceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az deployment group create \
                  --resource-group $(rgDev) \
                  --template-file infra/main.bicep \
                  --parameters env=dev location=$(location) ehSku=Standard throughputUnits=2
          - script: |
              npm install -g azure-streamanalytics-cicd@3.0.0
              azure-streamanalytics-cicd deploy \
                --project asa/factory.asaproj \
                --resourceGroup $(rgDev) \
                --jobName $(asaJobDev)
            displayName: Push ASA query to dev

- stage: TestQuery
  displayName: Test ASA query with reference data
  dependsOn: DeployDev
  jobs:
  - job: asaTest
    pool: { vmImage: 'ubuntu-latest' }
    steps:
    - script: |
        npm install -g azure-streamanalytics-cicd@3.0.0
        azure-streamanalytics-cicd test \
          --project asa/factory.asaproj \
          --testConfigPath asa/testdata/testConfig.json
      displayName: Run ASA local test
      env:
        AZURE_CLIENT_ID: $(spClientId)
        AZURE_TENANT_ID: $(spTenantId)
        AZURE_CLIENT_SECRET: $(spClientSecret)

- stage: PromoteProd
  displayName: Promote to prod
  dependsOn: TestQuery
  condition: succeeded()
  jobs:
  - deployment: deployProd
    environment: iot-prod
    pool: { vmImage: 'ubuntu-latest' }
    strategy:
      runOnce:
        deploy:
          steps:
          - checkout: self
          - task: AzureCLI@2
            displayName: bicep deploy prod
            inputs:
              azureSubscription: $(azureServiceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az deployment group create \
                  --resource-group $(rgProd) \
                  --template-file infra/main.bicep \
                  --parameters env=prod location=$(location) ehSku=Premium throughputUnits=4
          - script: |
              npm install -g azure-streamanalytics-cicd@3.0.0
              azure-streamanalytics-cicd deploy \
                --project asa/factory.asaproj \
                --resourceGroup $(rgProd) \
                --jobName $(asaJobProd) \
                --arm-template-pattern asa-out/*.JobTemplate.json
            displayName: Push ASA query to prod
          - task: AzureCLI@2
            displayName: Start prod job
            inputs:
              azureSubscription: $(azureServiceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az stream-analytics job start \
                  --resource-group $(rgProd) \
                  --job-name $(asaJobProd) \
                  --output-start-mode JobStartTime
```

The `azure-streamanalytics-cicd` npm package is the official Microsoft helper for taking an `asaproj` folder and producing an ARM template plus parameters file. The `test` subcommand runs the query against local sample and reference data and compares against an expected output file; this is the gate that stops a bad query touching prod.

## Step 6: Wire up the Power BI streaming dataset

i> Open Power BI service, go to the workspace you put in `groupId`, click New > Streaming dataset, pick API source.

ii> Add fields exactly matching the SELECT columns of the second SELECT in the ASA query: `deviceId` (text), `temperature` (number), `eventTs` (datetime), `anomalyScore` (number), `isAnomaly` (number).

iii> Save the dataset, name it `factory-anomalies` so it matches the `dataset` field in `powerbiOut.json`.

iv> The first time the ASA job runs it will authenticate to Power BI using the service principal you authorised when you set the output. After that, rows show up in the dataset within a couple of seconds of being detected.

v> Build a dashboard tile from the streaming dataset, pick the Line chart visual with `eventTs` on the X axis and `temperature` on the Y axis, filter by `isAnomaly = 1` for a red-dot anomaly tile.

## Step 7: Alert on anomalies via Azure Monitor

Run the command to create a metric alert on the ASA job custom metric:

```powershell
az monitor metrics alert create `
  --name "asa-factory-anomaly-spike" `
  --resource-group rg-iot-prod `
  --scopes $(az stream-analytics job show -g rg-iot-prod -n asa-factory-prod --query id -o tsv) `
  --condition "total OutputEvents > 50" `
  --window-size 5m `
  --evaluation-frequency 1m `
  --severity 2 `
  --action $(az monitor action-group show -g rg-iot-prod -n ag-oncall --query id -o tsv)
```

`OutputEvents` is the count of rows emitted by an ASA output. We are wiring the alert against the `powerbiOut` output specifically, so 50 anomaly rows in a 5-minute window means something is going seriously sideways on the floor and the on-call should get paged.

## Step 8: Throughput sizing and cost notes

A couple of rules of thumb from running this in production.

- One Streaming Unit (SU) on Stream Analytics handles roughly 1 MB/s ingress on a non-partitioned query. Our query is partitioned by `deviceId`, so you get linear scale out to 6 SU on a single node then it goes multi-node. Start at 3 SU for dev, 6 SU for prod, bump if SU utilization stays above 80%.
- Event Hubs Standard at 2 TU costs roughly $22/month plus ingress. Premium at 1 PU is about $700/month but you get tenant isolation, 90-day retention, and Schema Registry. For most factory workloads, Standard with auto-inflate to 10 TU is plenty.
- Cosmos DB serverless is right for dev, you only pay per RU consumed. For prod, provisioned autoscale with max 4000 RU/s on the aggregates container is the right answer if you know your peak hour.
- Power BI streaming dataset is included in Pro and PPU, no extra cost. The 200,000 rows-per-hour push limit per dataset matters if you push every raw sample; we only push anomalies so we are nowhere near the cap.

## Troubleshooting

- **ASA job stuck at Starting**: nine times out of ten this is the managed identity. The job's system-assigned identity needs `Azure Event Hubs Data Receiver` on the Event Hub, `Cosmos DB Built-in Data Contributor` on the Cosmos account, and Power BI workspace access. The portal shows `Authorization failed` and you have to dig into the activity log.
- **Cosmos partition hot-spotting**: RU/s spiking and 429s only on certain devices means a single device is shouting too loud. Spread the load or move that device's writes to a separate container.
- **AnomalyDetection returns null forever**: the function needs a minimum number of historical points. With `LIMIT DURATION(minute, 2)` on a 1 Hz stream you get 120 points, plenty; at 0.1 Hz you will wait 20 minutes.
- **Event Hubs partition skew**: if all `deviceId` values hash to two partitions, ASA parallelism collapses. Check the partition distribution in the Event Hubs metrics blade; if uneven, prepend a short hash to the partition key from IoT Hub.

## Clean up

When you are done testing, blow the whole resource group away with one command:

```powershell
az group delete --name rg-iot-dev --yes --no-wait
az group delete --name rg-iot-prod --yes --no-wait
```

If you have followed carefully you must have noticed we wired up the `cosmosOut` and `powerbiOut` outputs but did not build out the Synapse Link side. Cosmos has the analytical store enabled (`analyticalStorageTtl: -1` keeps everything forever), so the next step is to plug a Synapse workspace or a Fabric lakehouse into it and run KQL or Spark over the cold data without touching the operational RUs. Do the same for the device side; the IoT Hub step here assumed devices are already registered, in reality you want a device provisioning service (DPS) in front of IoT Hub so new presses get enrolled automatically. Wire it the same way, Bicep for the resource, az CLI for the registration script, ADO pipeline to push the firmware update. Then you have got the whole loop running on its own.

#azure #azuredevops #devops #cicdproject #iot #streamanalytics #eventhubs #cosmosdb #powerbi #fortune500 #seniordevopsengineer
