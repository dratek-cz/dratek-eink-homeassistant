# DRATEK eInk for Home Assistant

Minimal experimental Home Assistant custom integration for DRATEK/Picksmart BLE eInk price labels.

## Install locally

Copy `custom_components/dratek_eink` to your Home Assistant `config/custom_components/` folder.

Add this to `configuration.yaml`:

```yaml
dratek_eink:
```

Restart Home Assistant.

## First test service

```yaml
service: dratek_eink.send_text
data:
  address: "FF:FF:94:20:10:78"
  sdk_type: 75
  text: "Hello from HA"
```

Known tested SDK types:

- `75`: EPA LCD 400x300 BWR
- `267`: EPA LCD 250x122 BWR

This is a first minimal proof of concept. The next steps are discovery, template rendering, and a Home Assistant designer panel.
