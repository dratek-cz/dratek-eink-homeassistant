#include <Arduino.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <WebServer.h>
#include <WiFi.h>

static const char* WIFI_SSID = "CHANGE_ME";
static const char* WIFI_PASSWORD = "CHANGE_ME";
static const char* FIRMWARE_VERSION = "0.1.18-gateway";
static const uint16_t DRATEK_COMPANY_ID = 0x5053;

WebServer server(80);
String gatewayId;

String macId() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  mac.toLowerCase();
  return mac;
}

void sendJson(JsonDocument& doc, int status = 200) {
  String body;
  serializeJson(doc, body);
  server.send(status, "application/json", body);
}

void handleStatus() {
  JsonDocument doc;
  doc["ok"] = true;
  doc["gateway_id"] = gatewayId;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["ip"] = WiFi.localIP().toString();
  doc["mac"] = WiFi.macAddress();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  sendJson(doc);
}

bool hasDratekManufacturer(NimBLEAdvertisedDevice* device) {
  std::string manufacturer = device->getManufacturerData();
  if (manufacturer.length() < 2) return false;
  uint16_t companyId = static_cast<uint8_t>(manufacturer[0]) | (static_cast<uint8_t>(manufacturer[1]) << 8);
  return companyId == DRATEK_COMPANY_ID;
}

void handleScan() {
  int seconds = server.hasArg("seconds") ? server.arg("seconds").toInt() : 8;
  seconds = max(1, min(30, seconds));

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  scan->setInterval(80);
  scan->setWindow(60);

  NimBLEScanResults results = scan->start(seconds, false);
  JsonDocument doc;
  doc["ok"] = true;
  doc["gateway_id"] = gatewayId;
  doc["scan_seconds"] = seconds;
  JsonArray devices = doc["devices"].to<JsonArray>();

  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice device = results.getDevice(i);
    JsonObject item = devices.add<JsonObject>();
    item["address"] = device.getAddress().toString().c_str();
    item["name"] = device.haveName() ? device.getName().c_str() : "";
    item["rssi"] = device.getRSSI();
    item["dratek"] = hasDratekManufacturer(&device);
  }

  scan->clearResults();
  sendJson(doc);
}

void handleSendPlaceholder() {
  JsonDocument doc;
  doc["ok"] = false;
  doc["error"] = "send_not_implemented";
  doc["message"] = "BLE image transfer will be implemented in the next firmware step.";
  sendJson(doc, 501);
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(115200);
  delay(300);
  gatewayId = "dratek-eink-gateway-" + macId();

  connectWifi();
  NimBLEDevice::init(gatewayId.c_str());

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/scan", HTTP_GET, handleScan);
  server.on("/api/send", HTTP_POST, handleSendPlaceholder);
  server.onNotFound([]() {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "not_found";
    sendJson(doc, 404);
  });
  server.begin();
  Serial.println("DRATEK eInk gateway ready.");
}

void loop() {
  server.handleClient();
}
