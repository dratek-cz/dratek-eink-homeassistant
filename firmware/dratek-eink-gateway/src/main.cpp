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

static const char* FIRMWARE_VERSION = "0.1.38-gateway";
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

void handleRoot() {
  String body = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>";
  body += "<title>DRATEK eInk gateway</title><style>body{font-family:Arial,sans-serif;margin:24px;line-height:1.4;background:#f6f7f9;color:#111}main{max-width:980px;margin:auto}section{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}input,button{font:inherit;padding:9px;margin:4px 0;width:100%;box-sizing:border-box}button{background:#111827;color:#fff;border:0;border-radius:6px;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.pill{display:inline-block;background:#eef2ff;border-radius:999px;padding:5px 10px;margin:3px}</style></head><body><main>";
  body += "<h1>DRATEK eInk gateway</h1><section><h2>Status</h2>";
  body += "<span class='pill'>FW " + String(FIRMWARE_VERSION) + "</span><span class='pill'>IP " + WiFi.localIP().toString() + "</span><span class='pill'>RSSI " + String(WiFi.RSSI()) + "</span><span class='pill'>MAC " + WiFi.macAddress() + "</span>";
  body += "</section><section><h2>Nastaveni site</h2><form method='post' action='/config-form'><div class='grid'>";
  body += "<label>Hostname<input name='hostname' value='" + hostname + "'></label><label>SSID<input name='ssid'></label><label>Heslo<input name='password' type='password'></label>";
  body += "<label>Static IP<input name='ip' placeholder='prazdne = DHCP'></label><label>Gateway<input name='gateway' placeholder='192.168.1.1'></label><label>Subnet<input name='subnet' placeholder='255.255.255.0'></label><label>DNS<input name='dns' placeholder='192.168.1.1'></label>";
  body += "</div><button>Ulozit a restartovat</button></form></section><section><h2>API</h2><p><code>/api/status</code>, <code>/api/scan?seconds=8</code>, <code>/api/config</code></p></section>";
  body += "<p>Transfer API: <code>POST multipart /api/transfer/upload?address=XX:XX:XX:XX:XX:XX</code> and <code>GET /api/transfer/status?id=...</code></p>";
  body += "</main></body></html>";
  server.send(200, "text/html; charset=utf-8", body);
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

void handleConfigForm() {
  saveNetworkConfig(
    server.arg("ssid"),
    server.arg("password"),
    server.arg("hostname"),
    server.arg("ip"),
    server.arg("gateway"),
    server.arg("subnet"),
    server.arg("dns")
  );
  server.send(200, "text/plain; charset=utf-8", "Ulozeno. Gateway se restartuje.");
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
  server.on("/config-form", HTTP_POST, handleConfigForm);
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
