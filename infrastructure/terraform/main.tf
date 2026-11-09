terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
}

resource "azurerm_resource_group" "jobro_rg" {
  name     = "jobro-rg"
  location = "eastus"
}

resource "azurerm_container_registry" "jobro_acr" {
  name                = "jobroacr12345"
  resource_group_name = azurerm_resource_group.jobro_rg.name
  sku                 = "Basic"
  admin_enabled       = true
}
