#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

static const char* FIRMWARE_VERSION = "0.1.22-gateway";
static const uint16_t DRATEK_COMPANY_ID = 0x5053;

WebServer server(80);
Preferences prefs;
String gatewayId;
String hostname;
String serialLine;

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
  doc["hostname"] = hostname;
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

bool saveWifiConfig(const char* ssid, const char* password, const char* nextHostname) {
  if (!ssid || strlen(ssid) == 0) return false;
  prefs.begin("dratek", false);
  prefs.putString("ssid", ssid);
  prefs.putString("password", password ? password : "");
  if (nextHostname && strlen(nextHostname) > 0) {
    prefs.putString("hostname", nextHostname);
  }
  prefs.end();
  return true;
}

void printSerialStatus() {
  prefs.begin("dratek", true);
  String ssid = prefs.getString("ssid", "");
  String storedHostname = prefs.getString("hostname", hostname);
  prefs.end();

  JsonDocument doc;
  doc["ok"] = true;
  doc["message"] = "status";
  doc["gateway_id"] = gatewayId;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["hostname"] = hostname;
  doc["stored_hostname"] = storedHostname;
  doc["stored_ssid"] = ssid;
  doc["wifi_connected"] = WiFi.status() == WL_CONNECTED;
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  doc["wifi_rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  doc["mac"] = WiFi.macAddress();
  doc["uptime_ms"] = millis();
  serializeJson(doc, Serial);
  Serial.println();
}

bool readSerialConfigLine(const String& line) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error) return false;
  const char* cmd = doc["cmd"] | "";
  if (strcmp(cmd, "status") == 0) {
    printSerialStatus();
    return true;
  }
  const char* ssid = doc["ssid"] | "";
  const char* password = doc["password"] | "";
  const char* nextHostname = doc["hostname"] | hostname.c_str();
  if (!saveWifiConfig(ssid, password, nextHostname)) return false;
  Serial.println("{\"ok\":true,\"message\":\"wifi_config_saved\"}");
  delay(500);
  ESP.restart();
  return true;
}

void handleSerialConfig() {
  while (Serial.available()) {
    char c = static_cast<char>(Serial.read());
    if (c == '\n') {
      serialLine.trim();
      if (serialLine.length()) {
        if (!readSerialConfigLine(serialLine)) {
          Serial.println("{\"ok\":false,\"error\":\"invalid_wifi_config\"}");
        }
      }
      serialLine = "";
      continue;
    }
    if (serialLine.length() < 512) serialLine += c;
  }
}

void startMdns() {
  if (!MDNS.begin(hostname.c_str())) {
    Serial.println("mDNS start failed.");
    return;
  }
  MDNS.addService("dratek-eink-gateway", "tcp", 80);
  MDNS.addServiceTxt("dratek-eink-gateway", "tcp", "id", gatewayId.c_str());
  MDNS.addServiceTxt("dratek-eink-gateway", "tcp", "fw", FIRMWARE_VERSION);
  Serial.print("mDNS: ");
  Serial.print(hostname);
  Serial.println(".local");
}

void connectWifi() {
  prefs.begin("dratek", true);
  String ssid = prefs.getString("ssid", "");
  String password = prefs.getString("password", "");
  hostname = prefs.getString("hostname", gatewayId);
  prefs.end();

  if (ssid.length() == 0) {
    Serial.println("No Wi-Fi config. Send JSON over serial:");
    Serial.println("{\"ssid\":\"YourWifi\",\"password\":\"YourPassword\",\"hostname\":\"dratek-eink-gateway\"}");
    while (true) {
      handleSerialConfig();
      delay(20);
    }
  }

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostname.c_str());
  WiFi.begin(ssid.c_str(), password.c_str());
  Serial.print("Connecting to Wi-Fi");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 30000) {
    delay(500);
    Serial.print(".");
    handleSerialConfig();
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println();
    Serial.println("Wi-Fi connection failed. Send new JSON config over serial.");
    while (true) {
      handleSerialConfig();
      delay(20);
    }
  }
  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  startMdns();
}

void setup() {
  Serial.begin(115200);
  delay(300);
  gatewayId = "dratek-eink-gateway-" + macId();
  hostname = gatewayId;

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
  handleSerialConfig();
  server.handleClient();
}
