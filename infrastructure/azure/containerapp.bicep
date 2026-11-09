@description('Name of the Azure resource group')
param resourceGroupName string = 'jobro-rg'

@description('Azure location for deployment')
param location string = 'eastus'

@description('Container registry name')
param registryName string = 'jobroacr12345'

resource acr 'Microsoft.ContainerRegistry/registries@2024-01-01-preview' = {
  name: registryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

resource jobroContainerApp 'Microsoft.App/containerApps@2024-06-01-preview' = {
  name: 'jobro-app'
  location: location
  properties: {
    kubeEnvironmentId: ''
    configuration: {
      ingress: {
        external: true
        targetPort: 80
      }
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${acr.properties.loginServer}/jobro-backend:latest'
          resources: {
            cpu: 0.5
            memory: '1.0Gi'
          }
        }
      ]
    }
  }
}
