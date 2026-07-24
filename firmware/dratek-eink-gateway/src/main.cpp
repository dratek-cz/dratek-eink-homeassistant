#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_heap_caps.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <vector>

static const char* FIRMWARE_VERSION = "0.1.41-gateway";
#if CONFIG_IDF_TARGET_ESP32S3
static const char* CHIP_FAMILY = "esp32s3";
#else
static const char* CHIP_FAMILY = "esp32";
#endif
static const size_t MAX_TRANSFER_LOG_LINES = 80;
static const size_t MAX_UPLOAD_PAYLOAD_BYTES = 128UL * 1024UL;
static const uint32_t MDNS_REFRESH_INTERVAL_MS = 5UL * 60UL * 1000UL;
static const uint32_t WIFI_RECONNECT_INTERVAL_MS = 15UL * 1000UL;
static const uint16_t DRATEK_COMPANY_ID = 0x5053;
static const char* TRANSFER_UUIDS[][3] = {
  {"0000fef0-0000-1000-8000-00805f9b34fb", "0000fef1-0000-1000-8000-00805f9b34fb", "0000fef2-0000-1000-8000-00805f9b34fb"},
  {"0000fdf0-0000-1000-8000-00805f9b34fb", "0000fdf1-0000-1000-8000-00805f9b34fb", "0000fdf2-0000-1000-8000-00805f9b34fb"},
  {"0000fcf0-0000-1000-8000-00805f9b34fb", "0000fcf1-0000-1000-8000-00805f9b34fb", "0000fcf2-0000-1000-8000-00805f9b34fb"},
  {"0000fbf0-0000-1000-8000-00805f9b34fb", "0000fbf1-0000-1000-8000-00805f9b34fb", "0000fbf2-0000-1000-8000-00805f9b34fb"},
};

WebServer server(80);
Preferences prefs;
String gatewayId;
String hostname;
String serialLine;
std::vector<String> lastScanDevices;
std::vector<std::vector<uint8_t>> notifications;

struct TransferJob {
  String id;
  String address;
  String status = "idle";
  String error;
  std::vector<String> log;
  uint32_t createdMs = 0;
  uint32_t updatedMs = 0;
};

TransferJob transferJob;
std::vector<uint8_t> queuedPayload;
std::vector<uint8_t> uploadPayload;
String uploadAddress;
String uploadJobId;
String uploadError;
bool uploadDuplicate = false;
SemaphoreHandle_t transferMutex = nullptr;
bool transferTaskActive = false;
uint32_t transferSequence = 0;
bool mdnsStarted = false;
bool wifiWasConnected = false;
bool bleInitialized = false;
uint32_t lastMdnsStartMs = 0;
uint32_t lastWifiReconnectMs = 0;
bool otaInProgress = false;
String otaStatus = "idle";
String otaError;
size_t otaBytesWritten = 0;
size_t otaExpectedSize = 0;
uint32_t otaRestartAtMs = 0;

class TransferLogSink {
 public:
  virtual void add(const String& line) = 0;
  virtual ~TransferLogSink() = default;
};

class JobTransferLog : public TransferLogSink {
 public:
  explicit JobTransferLog(const String& jobId) : jobId_(jobId) {}

  void add(const String& line) override {
    if (!transferMutex) return;
    xSemaphoreTake(transferMutex, portMAX_DELAY);
    if (transferJob.id == jobId_) {
      if (transferJob.log.size() >= MAX_TRANSFER_LOG_LINES) transferJob.log.erase(transferJob.log.begin());
      transferJob.log.push_back(line);
      transferJob.updatedMs = millis();
    }
    xSemaphoreGive(transferMutex);
    Serial.println(line);
  }

 private:
  String jobId_;
};

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

String resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "power_on";
    case ESP_RST_EXT: return "external";
    case ESP_RST_SW: return "software";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "interrupt_watchdog";
    case ESP_RST_TASK_WDT: return "task_watchdog";
    case ESP_RST_WDT: return "watchdog";
    case ESP_RST_DEEPSLEEP: return "deep_sleep";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_SDIO: return "sdio";
    default: return "unknown";
  }
}

bool transferIsBusy() {
  if (!transferMutex) return false;
  xSemaphoreTake(transferMutex, portMAX_DELAY);
  bool busy = transferJob.status == "queued" || transferJob.status == "running";
  xSemaphoreGive(transferMutex);
  return busy;
}

bool gatewayOperationBusy() {
  return transferIsBusy() || otaInProgress || otaRestartAtMs != 0;
}

void ensureBleInitialized() {
  if (bleInitialized) return;
  Serial.println("Initializing BLE central stack.");
  NimBLEDevice::init("");
  bleInitialized = true;
  Serial.println("BLE initialized.");
}

void handleStatus() {
  prefs.begin("dratek", true);
  bool dhcp = prefs.getBool("dhcp", true);
  String staticIp = prefs.isKey("ip") ? prefs.getString("ip", "") : "";
  prefs.end();

  JsonDocument doc;
  doc["ok"] = true;
  doc["gateway_id"] = gatewayId;
  doc["hostname"] = hostname;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["chip"] = CHIP_FAMILY;
  doc["ip"] = WiFi.localIP().toString();
  doc["mac"] = WiFi.macAddress();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["minimum_free_heap"] = heap_caps_get_minimum_free_size(MALLOC_CAP_8BIT);
  doc["largest_free_block"] = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  doc["reset_reason"] = resetReasonName();
  doc["ble_initialized"] = bleInitialized;
  doc["mdns_started"] = mdnsStarted;
  if (transferMutex) {
    xSemaphoreTake(transferMutex, portMAX_DELAY);
    doc["transfer_status"] = transferJob.status;
    doc["transfer_job_id"] = transferJob.id;
    xSemaphoreGive(transferMutex);
  }
  doc["dhcp"] = dhcp;
  doc["static_ip"] = staticIp;
  doc["last_scan_devices"] = lastScanDevices.size();
  const esp_partition_t* runningPartition = esp_ota_get_running_partition();
  const esp_partition_t* updatePartition = esp_ota_get_next_update_partition(nullptr);
  doc["ota_supported"] = updatePartition != nullptr;
  doc["ota_status"] = otaStatus;
  doc["ota_error"] = otaError;
  doc["ota_bytes_written"] = otaBytesWritten;
  doc["ota_expected_size"] = otaExpectedSize;
  doc["firmware_size"] = ESP.getSketchSize();
  doc["flash_size"] = ESP.getFlashChipSize();
  doc["running_partition_size"] = runningPartition ? runningPartition->size : 0;
  doc["update_partition_size"] = updatePartition ? updatePartition->size : 0;
  sendJson(doc);
}

bool hasDratekManufacturer(NimBLEAdvertisedDevice* device) {
  std::string manufacturer = device->getManufacturerData();
  if (manufacturer.length() < 2) return false;
  uint16_t companyId = static_cast<uint8_t>(manufacturer[0]) | (static_cast<uint8_t>(manufacturer[1]) << 8);
  return companyId == DRATEK_COMPANY_ID;
}

void handleScan() {
  if (gatewayOperationBusy()) {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "gateway_busy";
    doc["message"] = "A display transfer is currently running.";
    sendJson(doc, 409);
    return;
  }
  int seconds = server.hasArg("seconds") ? server.arg("seconds").toInt() : 8;
  seconds = max(1, min(30, seconds));
  ensureBleInitialized();

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  scan->setInterval(80);
  scan->setWindow(60);

  NimBLEScanResults results = scan->start(seconds, false);
  lastScanDevices.clear();
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
    if (device.haveManufacturerData()) {
      std::string manufacturer = device.getManufacturerData();
      String manufacturerHex;
      manufacturerHex.reserve(manufacturer.size() * 2);
      const char* hex = "0123456789ABCDEF";
      for (uint8_t value : manufacturer) {
        manufacturerHex += hex[value >> 4];
        manufacturerHex += hex[value & 0x0F];
      }
      item["manufacturer_data"] = manufacturerHex;
    }
    if (item["dratek"]) {
      lastScanDevices.push_back(device.getAddress().toString().c_str());
    }
  }

  scan->clearResults();
  sendJson(doc);
}

void notifyCallback(NimBLERemoteCharacteristic* characteristic, uint8_t* data, size_t length, bool isNotify) {
  std::vector<uint8_t> packet(data, data + length);
  notifications.push_back(packet);
  if (notifications.size() > 30) notifications.erase(notifications.begin());
}

void clearNotifications() {
  notifications.clear();
}

String hexPacket(const std::vector<uint8_t>& packet) {
  const char* digits = "0123456789ABCDEF";
  String out;
  for (size_t i = 0; i < packet.size(); i++) {
    if (i) out += ' ';
    out += digits[(packet[i] >> 4) & 0x0F];
    out += digits[packet[i] & 0x0F];
  }
  return out;
}

bool waitForPacket(uint8_t prefix, std::vector<uint8_t>& out, uint32_t timeoutMs, int minBlock = -1) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    for (size_t i = 0; i < notifications.size(); i++) {
      std::vector<uint8_t> packet = notifications[i];
      notifications.erase(notifications.begin() + i);
      if (packet.empty() || packet[0] != prefix) continue;
      if (prefix == 0x05 && minBlock >= 0 && packet.size() >= 6 && packet[1] == 0) {
        int requested = (int)packet[2] | ((int)packet[3] << 8) | ((int)packet[4] << 16) | ((int)packet[5] << 24);
        if (requested < minBlock) continue;
      }
      out = packet;
      return true;
    }
    delay(20);
  }
  return false;
}

void addLog(TransferLogSink& log, const String& line) {
  log.add(line);
}

bool findTransferChars(
  NimBLEClient* client,
  NimBLERemoteCharacteristic*& controlChar,
  NimBLERemoteCharacteristic*& writeChar,
  String& usedService
) {
  for (size_t i = 0; i < sizeof(TRANSFER_UUIDS) / sizeof(TRANSFER_UUIDS[0]); i++) {
    NimBLERemoteService* service = client->getService(TRANSFER_UUIDS[i][0]);
    if (!service) continue;
    controlChar = service->getCharacteristic(TRANSFER_UUIDS[i][1]);
    writeChar = service->getCharacteristic(TRANSFER_UUIDS[i][2]);
    if (controlChar && writeChar) {
      usedService = service->getUUID().toString().c_str();
      return true;
    }
  }
  return false;
}

bool connectToDisplay(NimBLEClient*& client, const String& address, TransferLogSink& log) {
  String target = address;
  target.toLowerCase();
  for (int attempt = 1; attempt <= 3; attempt++) {
    addLog(log, "BLE connect attempt " + String(attempt) + "/3.");
    NimBLEScan* scan = NimBLEDevice::getScan();
    scan->setActiveScan(true);
    scan->setInterval(80);
    scan->setWindow(60);
    NimBLEScanResults results = scan->start(6, false);
    for (int i = 0; i < results.getCount(); i++) {
      NimBLEAdvertisedDevice device = results.getDevice(i);
      String found = device.getAddress().toString().c_str();
      found.toLowerCase();
      if (found != target) continue;
      addLog(log, "Target display seen in scan, RSSI " + String(device.getRSSI()) + ".");
      bool connected = client->connect(&device);
      scan->clearResults();
      if (connected) return true;
      addLog(log, "Connect via advertised device failed.");
      break;
    }
    scan->clearResults();
    addLog(log, "Trying direct address connect.");
    if (client->connect(NimBLEAddress(address.c_str()))) return true;
    NimBLEDevice::deleteClient(client);
    delay(250);
    client = NimBLEDevice::createClient();
    client->setConnectTimeout(18);
    delay(700);
  }
  return false;
}

bool sendPayloadToDisplay(const String& address, const std::vector<uint8_t>& payload, TransferLogSink& log) {
  NimBLEClient* client = NimBLEDevice::createClient();
  client->setConnectTimeout(18);
  addLog(log, "Connecting to display " + address + ".");
  bool connected = connectToDisplay(client, address, log);
  if (!connected) {
    NimBLEDevice::deleteClient(client);
    addLog(log, "BLE connection failed after retries.");
    return false;
  }

  NimBLERemoteCharacteristic* controlChar = nullptr;
  NimBLERemoteCharacteristic* writeChar = nullptr;
  String serviceUuid = "";
  if (!findTransferChars(client, controlChar, writeChar, serviceUuid)) {
    client->disconnect();
    NimBLEDevice::deleteClient(client);
    addLog(log, "DRATEK transfer characteristics were not found.");
    return false;
  }
  addLog(log, "Using service " + serviceUuid + ".");

  if (controlChar->canNotify()) controlChar->subscribe(true, notifyCallback);
  if (writeChar->canNotify()) writeChar->subscribe(true, notifyCallback);
  delay(300);

  clearNotifications();
  uint8_t blockRequest[1] = {0x01};
  addLog(log, "Requesting block size.");
  controlChar->writeValue(blockRequest, sizeof(blockRequest), true);
  std::vector<uint8_t> packet;
  if (!waitForPacket(0x01, packet, 5000)) {
    controlChar->writeValue(blockRequest, sizeof(blockRequest), false);
    if (!waitForPacket(0x01, packet, 5000)) {
      client->disconnect();
      NimBLEDevice::deleteClient(client);
      addLog(log, "Timed out waiting for block size.");
      return false;
    }
  }
  int blockSize = packet.size() >= 3 ? ((int)packet[1] ? (int)packet[1] : (int)packet[2]) : 0;
  if (blockSize < 8) {
    client->disconnect();
    NimBLEDevice::deleteClient(client);
    addLog(log, "Invalid block size response: " + hexPacket(packet));
    return false;
  }
  int chunkSize = blockSize - 4;
  int totalBlocks = (payload.size() + chunkSize - 1) / chunkSize;
  addLog(log, "Block size " + String(blockSize) + ", payload " + String(payload.size()) + " bytes, blocks " + String(totalBlocks) + ".");

  uint8_t prepare[6];
  prepare[0] = 0x02;
  uint32_t payloadSize = payload.size();
  prepare[1] = payloadSize & 0xFF;
  prepare[2] = (payloadSize >> 8) & 0xFF;
  prepare[3] = (payloadSize >> 16) & 0xFF;
  prepare[4] = (payloadSize >> 24) & 0xFF;
  prepare[5] = 0x01;
  clearNotifications();
  controlChar->writeValue(prepare, sizeof(prepare), true);
  if (!waitForPacket(0x02, packet, 8000) || packet.size() < 2 || packet[1] != 0) {
    client->disconnect();
    NimBLEDevice::deleteClient(client);
    addLog(log, "Prepare update rejected or timed out.");
    return false;
  }

  uint8_t start[1] = {0x03};
  clearNotifications();
  controlChar->writeValue(start, sizeof(start), true);
  if (!waitForPacket(0x05, packet, 12000)) {
    client->disconnect();
    NimBLEDevice::deleteClient(client);
    addLog(log, "Display did not request first block.");
    return false;
  }
  int firstBlock = 0;
  if (packet.size() >= 6 && packet[1] == 0) {
    firstBlock = (int)packet[2] | ((int)packet[3] << 8) | ((int)packet[4] << 16) | ((int)packet[5] << 24);
  }
  addLog(log, "Starting at block " + String(firstBlock) + ".");

  // SDK type 51 (SW bit 0x80) advances on the GATT write-complete callback.
  // It does not send a control-point notification after every image block.
  std::vector<uint8_t> block(blockSize);
  for (int blockNumber = firstBlock; blockNumber < totalBlocks; blockNumber++) {
    int startOffset = blockNumber * chunkSize;
    int dataLen = min(chunkSize, (int)payload.size() - startOffset);
    block[0] = blockNumber & 0xFF;
    block[1] = (blockNumber >> 8) & 0xFF;
    block[2] = (blockNumber >> 16) & 0xFF;
    block[3] = (blockNumber >> 24) & 0xFF;
    memcpy(block.data() + 4, payload.data() + startOffset, dataLen);

    bool written = false;
    for (int writeAttempt = 1; writeAttempt <= 3; writeAttempt++) {
      // response=true waits for the same GATT acknowledgement used by the Android SDK.
      written = writeChar->writeValue(block.data(), dataLen + 4, true);
      if (written) break;
      addLog(log, "BLE write failed for block " + String(blockNumber) + ", retry " + String(writeAttempt) + "/3.");
      delay(100);
    }
    if (!written) {
      client->disconnect();
      NimBLEDevice::deleteClient(client);
      addLog(log, "Display did not acknowledge image block " + String(blockNumber) + ".");
      return false;
    }

    if (blockNumber == firstBlock || blockNumber % 10 == 0 || blockNumber == totalBlocks - 1) {
      int percent = ((blockNumber + 1) * 100) / max(1, totalBlocks);
      addLog(log, "Acknowledged block " + String(blockNumber + 1) + "/" + String(totalBlocks) + " (" + String(percent) + "%).");
    }
    delay(5);
  }

  addLog(log, "All image blocks were acknowledged by BLE.");
  if (waitForPacket(0x05, packet, 30000)) {
    addLog(log, "Notification: " + hexPacket(packet));
    if (packet.size() > 1 && packet[1] == 0x08) {
      client->disconnect();
      NimBLEDevice::deleteClient(client);
      addLog(log, "Display confirmed transfer complete.");
      return true;
    }
    if (packet.size() > 1 && packet[1] != 0) {
      client->disconnect();
      NimBLEDevice::deleteClient(client);
      addLog(log, "Display rejected image transfer: " + hexPacket(packet));
      return false;
    }
  }

  // The original SDK reports success after the last acknowledged GATT write;
  // some display firmware versions do not send a separate final notification.
  client->disconnect();
  NimBLEDevice::deleteClient(client);
  addLog(log, "Transfer completed; no separate final notification was required.");
  return true;
}

void failOta(const String& error) {
  otaError = error;
  otaStatus = "failed";
  otaInProgress = false;
  if (Update.isRunning()) Update.abort();
  Serial.println("OTA failed: " + error);
}

void handleOtaUploadChunk() {
  HTTPUpload& upload = server.upload();
  if (upload.status == UPLOAD_FILE_START) {
    otaError = "";
    otaBytesWritten = 0;
    otaExpectedSize = strtoul(server.arg("size").c_str(), nullptr, 10);
    String expectedMd5 = server.arg("md5");

    if (transferIsBusy()) {
      failOta("gateway_busy");
      return;
    }
    if (otaExpectedSize == 0 || expectedMd5.length() != 32) {
      failOta("invalid_ota_metadata");
      return;
    }
    const esp_partition_t* updatePartition = esp_ota_get_next_update_partition(nullptr);
    if (!updatePartition || otaExpectedSize > updatePartition->size) {
      failOta("firmware_too_large");
      return;
    }

    otaInProgress = true;
    otaStatus = "uploading";
    if (!Update.begin(otaExpectedSize, U_FLASH) || !Update.setMD5(expectedMd5.c_str())) {
      failOta(String("ota_begin_failed: ") + Update.errorString());
      return;
    }
    Serial.println("OTA upload started: " + String(otaExpectedSize) + " bytes for " + String(CHIP_FAMILY) + ".");
    return;
  }

  if (upload.status == UPLOAD_FILE_WRITE) {
    if (!otaInProgress || otaError.length()) return;
    size_t written = Update.write(upload.buf, upload.currentSize);
    otaBytesWritten += written;
    if (written != upload.currentSize) {
      failOta(String("ota_write_failed: ") + Update.errorString());
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_END) {
    if (!otaInProgress || otaError.length()) return;
    if (otaBytesWritten != otaExpectedSize) {
      failOta("ota_size_mismatch");
      return;
    }
    if (!Update.end()) {
      failOta(String("ota_verify_failed: ") + Update.errorString());
      return;
    }
    otaInProgress = false;
    otaStatus = "ready_to_reboot";
    Serial.println("OTA image verified. Reboot pending.");
    return;
  }

  if (upload.status == UPLOAD_FILE_ABORTED) {
    failOta("ota_upload_aborted");
  }
}

void handleOtaUploadComplete() {
  JsonDocument doc;
  if (otaStatus != "ready_to_reboot") {
    doc["ok"] = false;
    doc["error"] = otaError.length() ? otaError : "ota_upload_incomplete";
    doc["bytes_written"] = otaBytesWritten;
    doc["expected_size"] = otaExpectedSize;
    sendJson(doc, otaError == "gateway_busy" ? 409 : 400);
    return;
  }

  doc["ok"] = true;
  doc["status"] = otaStatus;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["chip"] = CHIP_FAMILY;
  doc["bytes_written"] = otaBytesWritten;
  doc["message"] = "Firmware verified. Gateway will reboot.";
  sendJson(doc, 202);
  otaRestartAtMs = millis() + 1500;
}

void handleTransferUploadChunk() {
  HTTPUpload& upload = server.upload();
  if (upload.status == UPLOAD_FILE_START) {
    uploadPayload.clear();
    uploadPayload.shrink_to_fit();
    uploadAddress = server.arg("address");
    uploadJobId = server.arg("id");
    uploadError = "";
    uploadDuplicate = false;

    if (uploadAddress.length() == 0) {
      uploadError = "missing_address";
      return;
    }
    if (uploadJobId.length() && transferMutex) {
      xSemaphoreTake(transferMutex, portMAX_DELAY);
      uploadDuplicate = uploadJobId == transferJob.id;
      xSemaphoreGive(transferMutex);
    }
    if (!uploadDuplicate && gatewayOperationBusy()) {
      uploadError = "gateway_busy";
    }
    return;
  }

  if (upload.status == UPLOAD_FILE_WRITE) {
    if (uploadError.length() || uploadDuplicate) return;
    size_t nextSize = uploadPayload.size() + upload.currentSize;
    if (nextSize > MAX_UPLOAD_PAYLOAD_BYTES) {
      uploadError = "payload_too_large";
      uploadPayload.clear();
      uploadPayload.shrink_to_fit();
      return;
    }
    uploadPayload.insert(uploadPayload.end(), upload.buf, upload.buf + upload.currentSize);
    return;
  }

  if (upload.status == UPLOAD_FILE_ABORTED) {
    uploadError = "upload_aborted";
    uploadPayload.clear();
    uploadPayload.shrink_to_fit();
  }
}

void handleTransferUploadComplete() {
  JsonDocument doc;
  if (uploadDuplicate) {
    xSemaphoreTake(transferMutex, portMAX_DELAY);
    String existingStatus = transferJob.status;
    xSemaphoreGive(transferMutex);
    doc["ok"] = true;
    doc["job_id"] = uploadJobId;
    doc["status"] = existingStatus;
    doc["duplicate"] = true;
    sendJson(doc, 202);
    return;
  }
  if (uploadError.length()) {
    doc["ok"] = false;
    doc["error"] = uploadError;
    int status = uploadError == "gateway_busy" ? 409 : 400;
    sendJson(doc, status);
    return;
  }
  if (uploadPayload.empty()) {
    doc["ok"] = false;
    doc["error"] = "empty_payload";
    sendJson(doc, 400);
    return;
  }
  if (gatewayOperationBusy()) {
    doc["ok"] = false;
    doc["error"] = "gateway_busy";
    sendJson(doc, 409);
    return;
  }

  String jobId = uploadJobId.length() ? uploadJobId : String(millis(), HEX) + "-" + String(++transferSequence, HEX);
  size_t payloadBytes = uploadPayload.size();
  xSemaphoreTake(transferMutex, portMAX_DELAY);
  queuedPayload.swap(uploadPayload);
  transferJob.id = jobId;
  transferJob.address = uploadAddress;
  transferJob.status = "queued";
  transferJob.error = "";
  transferJob.log.clear();
  transferJob.createdMs = millis();
  transferJob.updatedMs = transferJob.createdMs;
  xSemaphoreGive(transferMutex);

  doc["ok"] = true;
  doc["job_id"] = jobId;
  doc["status"] = "queued";
  doc["payload_bytes"] = payloadBytes;
  doc["transport"] = "multipart_binary";
  doc["free_heap"] = ESP.getFreeHeap();
  doc["largest_free_block"] = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  sendJson(doc, 202);
}

void handleTransferStatus() {
  JsonDocument doc;
  String requestedId = server.arg("id");
  xSemaphoreTake(transferMutex, portMAX_DELAY);
  if (requestedId.length() == 0 || requestedId != transferJob.id) {
    xSemaphoreGive(transferMutex);
    doc["ok"] = false;
    doc["error"] = "transfer_job_not_found";
    sendJson(doc, 404);
    return;
  }
  doc["ok"] = transferJob.status == "succeeded";
  doc["job_id"] = transferJob.id;
  doc["status"] = transferJob.status;
  doc["error"] = transferJob.error;
  doc["address"] = transferJob.address;
  doc["created_ms"] = transferJob.createdMs;
  doc["updated_ms"] = transferJob.updatedMs;
  JsonArray log = doc["log"].to<JsonArray>();
  for (const String& line : transferJob.log) log.add(line);
  xSemaphoreGive(transferMutex);
  doc["free_heap"] = ESP.getFreeHeap();
  doc["minimum_free_heap"] = heap_caps_get_minimum_free_size(MALLOC_CAP_8BIT);
  doc["largest_free_block"] = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  sendJson(doc);
}

void transferTask(void*) {
  String jobId;
  String address;
  std::vector<uint8_t> payload;
  xSemaphoreTake(transferMutex, portMAX_DELAY);
  jobId = transferJob.id;
  address = transferJob.address;
  payload.swap(queuedPayload);
  transferJob.status = "running";
  transferJob.updatedMs = millis();
  xSemaphoreGive(transferMutex);

  JobTransferLog log(jobId);
  ensureBleInitialized();
  addLog(log, "Transfer job " + jobId + " started.");
  addLog(log, "Payload " + String(payload.size()) + " bytes loaded; free heap " + String(ESP.getFreeHeap()) + ".");
  addLog(log, "Largest free memory block " + String(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)) + " bytes.");
  bool ok = sendPayloadToDisplay(address, payload, log);
  payload.clear();
  payload.shrink_to_fit();
  addLog(log, "Payload released; free heap " + String(ESP.getFreeHeap()) + ".");

  xSemaphoreTake(transferMutex, portMAX_DELAY);
  if (transferJob.id == jobId) {
    transferJob.status = ok ? "succeeded" : "failed";
    transferJob.error = ok ? "" : "ble_transfer_failed";
    transferJob.updatedMs = millis();
  }
  transferTaskActive = false;
  xSemaphoreGive(transferMutex);
  vTaskDelete(nullptr);
}

void startQueuedTransfer() {
  if (!transferMutex) return;
  xSemaphoreTake(transferMutex, portMAX_DELAY);
  bool shouldStart = transferJob.status == "queued" && !transferTaskActive
    && millis() - transferJob.createdMs >= 1000;
  if (shouldStart) transferTaskActive = true;
  xSemaphoreGive(transferMutex);
  if (!shouldStart) return;

  BaseType_t created = xTaskCreate(transferTask, "dratek-transfer", 12288, nullptr, 1, nullptr);
  if (created == pdPASS) return;

  xSemaphoreTake(transferMutex, portMAX_DELAY);
  transferTaskActive = false;
  transferJob.status = "failed";
  transferJob.error = "transfer_task_start_failed";
  transferJob.updatedMs = millis();
  queuedPayload.clear();
  queuedPayload.shrink_to_fit();
  xSemaphoreGive(transferMutex);
}

static const char ADMIN_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRATEK eInk Gateway</title>
<style>
:root{color-scheme:light;--bg:#f3f5f7;--surface:#fff;--text:#17202a;--muted:#66717d;--line:#dfe4e8;--brand:#d71920;--dark:#20262d;--green:#16834b;--amber:#b46a00;--red:#b42318;--shadow:0 10px 28px rgba(20,28,38,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 Arial,sans-serif}button,input{font:inherit}button{min-height:40px;border:0;border-radius:7px;padding:9px 14px;background:var(--dark);color:#fff;font-weight:700;cursor:pointer}button:hover:not(:disabled){background:#0d1117}button:disabled{opacity:.5;cursor:not-allowed}.secondary{background:#fff;color:var(--text);border:1px solid var(--line)}.danger{background:var(--brand)}
.shell{max-width:1180px;margin:auto;padding:20px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.brand{display:flex;align-items:center;gap:12px}.mark{width:44px;height:44px;border-radius:8px;background:var(--brand);display:grid;place-items:center;color:#fff;font-size:18px;font-weight:900}.brand h1{font-size:21px;margin:0}.brand p{margin:2px 0 0;color:var(--muted);font-size:12px}.actions{display:flex;align-items:center;gap:8px}.online{display:inline-flex;align-items:center;gap:7px;font-weight:700}.dot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(22,131,75,.12)}
.notice{display:none;margin-bottom:14px;border:1px solid #efb5b5;background:#fff0f0;color:var(--red);padding:11px 13px;border-radius:7px}.notice.show{display:block}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.metric{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:15px;box-shadow:var(--shadow);min-width:0}.metric-label{font-size:11px;text-transform:uppercase;font-weight:800;color:var(--muted);margin-bottom:8px}.metric-value{font-size:20px;font-weight:800;overflow-wrap:anywhere}.metric-sub{font-size:12px;color:var(--muted);margin-top:4px}
.grid{display:grid;grid-template-columns:1.25fr .75fr;gap:14px}.panel{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px;box-shadow:var(--shadow);margin-bottom:14px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.panel h2{font-size:15px;margin:0}.panel p{color:var(--muted)}.badges{display:flex;flex-wrap:wrap;gap:7px}.badge{display:inline-flex;align-items:center;min-height:27px;padding:4px 9px;border-radius:999px;background:#eef1f4;color:#43505c;font-size:12px;font-weight:700}.badge.good{background:#e3f5eb;color:#11663c}.badge.warn{background:#fff1d9;color:#865000}
.operation{display:grid;grid-template-columns:1fr 1fr;gap:10px}.operation-item{border-left:3px solid var(--line);padding:7px 10px}.operation-item strong{display:block;margin-bottom:3px}.operation-item span{color:var(--muted);font-size:12px}.scan-empty{padding:28px 12px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:7px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px 7px;border-bottom:1px solid var(--line)}th{font-size:10px;text-transform:uppercase;color:var(--muted)}.signal{font-weight:800}.signal.good{color:var(--green)}.signal.warn{color:var(--amber)}.signal.bad{color:var(--red)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:grid;gap:5px}.field.full{grid-column:1/-1}.field label{font-size:12px;font-weight:700;color:#394550}.field input{width:100%;min-height:40px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:#fff;color:var(--text)}.field input:focus{outline:2px solid rgba(215,25,32,.16);border-color:var(--brand)}.check{display:flex;align-items:center;gap:8px}.check input{width:17px;height:17px}.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.static-fields.hidden{display:none}
.facts{display:grid;grid-template-columns:auto 1fr;gap:8px 15px;margin:0}.facts dt{color:var(--muted)}.facts dd{margin:0;text-align:right;font-weight:700;overflow-wrap:anywhere}details{border-top:1px solid var(--line);margin-top:14px;padding-top:12px}summary{cursor:pointer;font-weight:700}.footer{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:11px;padding:3px 2px 20px}.spinner{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:850px){.metrics{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}}@media(max-width:520px){.shell{padding:12px}.topbar{align-items:flex-start}.actions .online{display:none}.metrics,.form-grid,.operation{grid-template-columns:1fr}.field.full{grid-column:auto}.panel-head{align-items:flex-start;flex-direction:column}.footer{flex-direction:column}}
</style></head>
<body><main class="shell">
<header class="topbar"><div class="brand"><div class="mark">DE</div><div><h1>DRATEK eInk Gateway</h1><p id="identity">Nacitam identitu zarizeni...</p></div></div><div class="actions"><span class="online"><i class="dot"></i><span id="onlineText">Online</span></span><button id="refresh" class="secondary" type="button">Obnovit</button></div></header>
<div id="notice" class="notice"></div>
<section class="metrics">
<article class="metric"><div class="metric-label">Sit</div><div id="ip" class="metric-value">-</div><div id="wifi" class="metric-sub">Wi-Fi se nacita</div></article>
<article class="metric"><div class="metric-label">Bluetooth LE</div><div id="ble" class="metric-value">-</div><div id="scanCount" class="metric-sub">Posledni scan: -</div></article>
<article class="metric"><div class="metric-label">Volna pamet</div><div id="heap" class="metric-value">-</div><div id="heapBlock" class="metric-sub">Nejvetsi blok: -</div></article>
<article class="metric"><div class="metric-label">Firmware</div><div id="firmware" class="metric-value">-</div><div id="chip" class="metric-sub">-</div></article>
</section>
<div class="grid"><div>
<section class="panel"><div class="panel-head"><div><h2>Provozni stav</h2><p>Aktualni cinnost gatewaye a pripravenost sluzeb.</p></div><div class="badges"><span id="mdnsBadge" class="badge">mDNS</span><span id="otaBadge" class="badge">OTA</span></div></div><div class="operation"><div class="operation-item"><strong>Prenos do displeje</strong><span id="transfer">-</span></div><div class="operation-item"><strong>Aktualizace gatewaye</strong><span id="otaStatus">-</span></div></div></section>
<section class="panel"><div class="panel-head"><div><h2>BLE zarizeni v dosahu</h2><p>Aktivni scan trva osm sekund a docasne pozastavi ostatni BLE operace.</p></div><button id="scan" type="button">Spustit BLE scan</button></div><div id="scanResult" class="scan-empty">Scan zatim nebyl spusten.</div></section>
</div><aside>
<section class="panel"><div class="panel-head"><div><h2>Sitove nastaveni</h2><p>Zmena konfigurace vyvola restart gatewaye.</p></div></div><form id="networkForm"><div class="form-grid"><div class="field full"><label for="hostname">Nazev gatewaye</label><input id="hostname" maxlength="63" autocomplete="off"></div><div class="field"><label for="ssid">Wi-Fi SSID</label><input id="ssid" autocomplete="off"></div><div class="field"><label for="password">Nove heslo</label><input id="password" type="password" placeholder="Prazdne = beze zmeny"></div><div class="field full"><label class="check"><input id="dhcp" type="checkbox">Pouzit automatickou adresu DHCP</label></div></div><div id="staticFields" class="static-fields"><div class="form-grid"><div class="field"><label for="staticIp">IP adresa</label><input id="staticIp" placeholder="192.168.1.180"></div><div class="field"><label for="gateway">Vychozi brana</label><input id="gateway" placeholder="192.168.1.1"></div><div class="field"><label for="subnet">Maska site</label><input id="subnet" placeholder="255.255.255.0"></div><div class="field"><label for="dns">DNS server</label><input id="dns" placeholder="192.168.1.1"></div></div></div><div class="form-actions"><button id="saveNetwork" class="danger" type="submit">Ulozit a restartovat</button></div></form></section>
<section class="panel"><div class="panel-head"><div><h2>Diagnostika</h2><p>Technicke informace pro kontrolu provozu.</p></div></div><dl class="facts"><dt>Doba behu</dt><dd id="uptime">-</dd><dt>MAC</dt><dd id="mac">-</dd><dt>Posledni restart</dt><dd id="reset">-</dd><dt>Velikost firmware</dt><dd id="firmwareSize">-</dd><dt>OTA oddil</dt><dd id="otaSize">-</dd></dl><details><summary>API rozhrani</summary><p><code>GET /api/status</code><br><code>GET /api/scan?seconds=8</code><br><code>GET/POST /api/config</code></p></details></section>
</aside></div>
<footer class="footer"><span>DRATEK eInk Gateway</span><span>Stav se automaticky obnovuje kazdych 10 sekund.</span></footer>
</main>
<script>
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bytes=n=>{n=Number(n)||0;return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' kB'},uptime=ms=>{let s=Math.floor((Number(ms)||0)/1000),d=Math.floor(s/86400);s%=86400;let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return(d?d+' d ':'')+h+' h '+m+' min'};
function notice(text){$('notice').textContent=text||'';$('notice').classList.toggle('show',!!text)}
async function loadStatus(){try{const r=await fetch('/api/status',{cache:'no-store'}),s=await r.json();if(!r.ok)throw Error(s.error||'Status neni dostupny');notice('');$('onlineText').textContent='Online';$('identity').textContent=s.hostname+' | '+s.gateway_id;$('ip').textContent=s.ip||'-';$('wifi').textContent='RSSI '+s.wifi_rssi+' dBm | '+(s.dhcp?'DHCP':'Staticka IP');$('ble').textContent=s.ble_initialized?'Aktivni':'Priprava';$('scanCount').textContent='Posledni scan: '+s.last_scan_devices+' DRATEK';$('heap').textContent=bytes(s.free_heap);$('heapBlock').textContent='Nejvetsi blok: '+bytes(s.largest_free_block);$('firmware').textContent=s.firmware;$('chip').textContent=String(s.chip||'').toUpperCase();$('transfer').textContent=s.transfer_status||'idle';$('otaStatus').textContent=s.ota_status||'idle';$('mdnsBadge').className='badge '+(s.mdns_started?'good':'warn');$('mdnsBadge').textContent='mDNS '+(s.mdns_started?'aktivni':'neaktivni');$('otaBadge').className='badge '+(s.ota_supported?'good':'warn');$('otaBadge').textContent='OTA '+(s.ota_supported?'pripraveno':'nedostupne');$('uptime').textContent=uptime(s.uptime_ms);$('mac').textContent=s.mac||'-';$('reset').textContent=s.reset_reason||'-';$('firmwareSize').textContent=bytes(s.firmware_size);$('otaSize').textContent=bytes(s.update_partition_size)}catch(e){$('onlineText').textContent='Nedostupna';notice('Stav gatewaye se nepodarilo nacist: '+e.message)}}
async function loadConfig(){try{const r=await fetch('/api/config',{cache:'no-store'}),c=await r.json();$('hostname').value=c.hostname||'';$('ssid').value=c.ssid||'';$('dhcp').checked=c.dhcp!==false;$('staticIp').value=c.ip||'';$('gateway').value=c.gateway||'';$('subnet').value=c.subnet||'';$('dns').value=c.dns||'';toggleStatic()}catch(e){notice('Sitovou konfiguraci se nepodarilo nacist: '+e.message)}}
function toggleStatic(){$('staticFields').classList.toggle('hidden',$('dhcp').checked)}
$('refresh').onclick=loadStatus;$('dhcp').onchange=toggleStatic;
$('scan').onclick=async()=>{const b=$('scan');b.disabled=true;b.innerHTML='<span class="spinner"></span> Skenuji';$('scanResult').className='scan-empty';$('scanResult').textContent='Probiha BLE scan...';try{const r=await fetch('/api/scan?seconds=8'),j=await r.json();if(!r.ok)throw Error(j.error||'Scan selhal');const list=j.devices||[];if(!list.length){$('scanResult').textContent='V dosahu nebylo nalezeno zadne BLE zarizeni.'}else{$('scanResult').className='';$('scanResult').innerHTML='<table><thead><tr><th>Zarizeni</th><th>Adresa</th><th>Signal</th><th>Typ</th></tr></thead><tbody>'+list.sort((a,b)=>b.rssi-a.rssi).map(d=>{const c=d.rssi>-65?'good':d.rssi>-80?'warn':'bad';return'<tr><td>'+esc(d.name||'Bez nazvu')+'</td><td>'+esc(d.address)+'</td><td class="signal '+c+'">'+esc(d.rssi)+' dBm</td><td>'+(d.dratek?'<span class="badge good">DRATEK eInk</span>':'BLE')+'</td></tr>'}).join('')+'</tbody></table>'}}catch(e){$('scanResult').textContent='Scan selhal: '+e.message}finally{b.disabled=false;b.textContent='Spustit BLE scan';loadStatus()}};
$('networkForm').onsubmit=async e=>{e.preventDefault();if(!confirm('Ulozit sitove nastaveni a restartovat gateway?'))return;const b=$('saveNetwork');b.disabled=true;b.innerHTML='<span class="spinner"></span> Ukladam';const data={hostname:$('hostname').value.trim(),ssid:$('ssid').value.trim(),password:$('password').value,ip:$('dhcp').checked?'':$('staticIp').value.trim(),gateway:$('gateway').value.trim(),subnet:$('subnet').value.trim(),dns:$('dns').value.trim()};try{const r=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),j=await r.json();if(!r.ok)throw Error(j.error||'Ulozeni selhalo');notice('Nastaveni bylo ulozeno. Gateway se restartuje...')}catch(e){notice('Nastaveni se nepodarilo ulozit: '+e.message);b.disabled=false;b.textContent='Ulozit a restartovat'}};
loadStatus();loadConfig();setInterval(loadStatus,10000);
</script></body></html>)HTML";

void handleRoot() {
  server.send_P(200, "text/html; charset=utf-8", ADMIN_PAGE);
}

IPAddress parseIp(const String& value, const IPAddress& fallback) {
  IPAddress ip;
  if (value.length() && ip.fromString(value)) return ip;
  return fallback;
}

void saveNetworkConfig(const String& ssid, const String& password, const String& nextHostname, const String& ip, const String& gateway, const String& subnet, const String& dns) {
  prefs.begin("dratek", false);
  if (ssid.length()) prefs.putString("ssid", ssid);
  if (password.length()) prefs.putString("password", password);
  if (nextHostname.length()) prefs.putString("hostname", nextHostname);
  prefs.putBool("dhcp", ip.length() == 0);
  prefs.putString("ip", ip);
  prefs.putString("gateway", gateway);
  prefs.putString("subnet", subnet);
  prefs.putString("dns", dns);
  prefs.end();
}

void handleConfig() {
  if (server.method() == HTTP_GET) {
    prefs.begin("dratek", true);
    JsonDocument doc;
    doc["ok"] = true;
    doc["hostname"] = hostname;
    doc["ssid"] = prefs.getString("ssid", "");
    doc["dhcp"] = prefs.getBool("dhcp", true);
    doc["ip"] = prefs.getString("ip", "");
    doc["gateway"] = prefs.getString("gateway", "");
    doc["subnet"] = prefs.getString("subnet", "");
    doc["dns"] = prefs.getString("dns", "");
    prefs.end();
    sendJson(doc);
    return;
  }
  JsonDocument request;
  DeserializationError error = deserializeJson(request, server.arg("plain"));
  if (error) {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "invalid_json";
    sendJson(doc, 400);
    return;
  }
  saveNetworkConfig(
    request["ssid"] | "",
    request["password"] | "",
    request["hostname"] | "",
    request["ip"] | "",
    request["gateway"] | "",
    request["subnet"] | "",
    request["dns"] | ""
  );
  JsonDocument doc;
  doc["ok"] = true;
  doc["message"] = "config_saved_restarting";
  sendJson(doc);
  delay(500);
  ESP.restart();
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
  doc["chip"] = CHIP_FAMILY;
  doc["ota_supported"] = esp_ota_get_next_update_partition(nullptr) != nullptr;
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
  if (mdnsStarted) {
    MDNS.end();
    mdnsStarted = false;
    delay(50);
  }
  if (!MDNS.begin(hostname.c_str())) {
    Serial.println("mDNS start failed.");
    return;
  }
  MDNS.setInstanceName("DRATEK eInk gateway");
  MDNS.addService("dratek-eink-gateway", "tcp", 80);
  MDNS.addServiceTxt("dratek-eink-gateway", "tcp", "id", gatewayId.c_str());
  MDNS.addServiceTxt("dratek-eink-gateway", "tcp", "fw", FIRMWARE_VERSION);
  MDNS.addServiceTxt("dratek-eink-gateway", "tcp", "ip", WiFi.localIP().toString());
  MDNS.addServiceTxt("dratek-eink-gateway", "tcp", "chip", CHIP_FAMILY);
  MDNS.addServiceTxt("dratek-eink-gateway", "tcp", "ota", "1");
  MDNS.addService("http", "tcp", 80);
  MDNS.addServiceTxt("http", "tcp", "model", "DRATEK eInk gateway");
  mdnsStarted = true;
  lastMdnsStartMs = millis();
  Serial.print("mDNS: ");
  Serial.print(hostname);
  Serial.println(".local");
}

void maintainNetworkServices() {
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wifiWasConnected) {
    Serial.print("Wi-Fi restored, IP: ");
    Serial.println(WiFi.localIP());
    startMdns();
  } else if (!connected && wifiWasConnected) {
    Serial.println("Wi-Fi disconnected; waiting to restore mDNS.");
    if (mdnsStarted) MDNS.end();
    mdnsStarted = false;
  }

  if (!connected && millis() - lastWifiReconnectMs >= WIFI_RECONNECT_INTERVAL_MS) {
    lastWifiReconnectMs = millis();
    Serial.println("Trying to reconnect Wi-Fi.");
    WiFi.reconnect();
  }

  if (
    connected && mdnsStarted && !gatewayOperationBusy()
    && millis() - lastMdnsStartMs >= MDNS_REFRESH_INTERVAL_MS
  ) {
    Serial.println("Refreshing mDNS advertisement.");
    startMdns();
  }
  wifiWasConnected = connected;
}

void connectWifi() {
  prefs.begin("dratek", true);
  String ssid = prefs.getString("ssid", "");
  String password = prefs.getString("password", "");
  hostname = prefs.getString("hostname", gatewayId);
  bool dhcp = prefs.getBool("dhcp", true);
  String staticIp = prefs.isKey("ip") ? prefs.getString("ip", "") : "";
  String gatewayIp = prefs.isKey("gateway") ? prefs.getString("gateway", "") : "";
  String subnetIp = prefs.isKey("subnet") ? prefs.getString("subnet", "") : "";
  String dnsIp = prefs.isKey("dns") ? prefs.getString("dns", "") : "";
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
  WiFi.setSleep(true);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.setHostname(hostname.c_str());
  if (!dhcp && staticIp.length()) {
    IPAddress local;
    IPAddress gw;
    IPAddress subnet;
    IPAddress dns;
    local.fromString(staticIp);
    gw = parseIp(gatewayIp, IPAddress(192, 168, 1, 1));
    subnet = parseIp(subnetIp, IPAddress(255, 255, 255, 0));
    dns = parseIp(dnsIp, gw);
    WiFi.config(local, gw, subnet, dns);
  }
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
  wifiWasConnected = true;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  gatewayId = "dratek-eink-gateway-" + macId();
  hostname = gatewayId;
  transferMutex = xSemaphoreCreateMutex();
  if (!transferMutex) {
    Serial.println("Unable to create transfer mutex.");
    delay(1000);
    ESP.restart();
  }

  Serial.println("Initializing BLE before Wi-Fi and payload allocation.");
  ensureBleInitialized();
  connectWifi();

  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/scan", HTTP_GET, handleScan);
  server.on("/api/transfer/upload", HTTP_POST, handleTransferUploadComplete, handleTransferUploadChunk);
  server.on("/api/transfer/status", HTTP_GET, handleTransferStatus);
  server.on("/api/ota/upload", HTTP_POST, handleOtaUploadComplete, handleOtaUploadChunk);
  server.on("/api/config", HTTP_GET, handleConfig);
  server.on("/api/config", HTTP_POST, handleConfig);
  server.on("/", HTTP_GET, handleRoot);
  server.onNotFound([]() {
    JsonDocument doc;
    doc["ok"] = false;
    doc["error"] = "not_found";
    sendJson(doc, 404);
  });
  server.begin();
  Serial.println("DRATEK eInk gateway network services ready. BLE will initialize on first use.");
}

void loop() {
  handleSerialConfig();
  server.handleClient();
  if (otaRestartAtMs != 0 && static_cast<int32_t>(millis() - otaRestartAtMs) >= 0) {
    Serial.println("Restarting into the updated firmware.");
    delay(100);
    ESP.restart();
  }
  startQueuedTransfer();
  maintainNetworkServices();
  delay(2);
}
