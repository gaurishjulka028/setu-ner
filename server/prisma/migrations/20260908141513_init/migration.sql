-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "points" INTEGER,
    "badges" TEXT,
    "passwordHash" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "districts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "hq" TEXT NOT NULL,
    "population" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "road" TEXT NOT NULL,
    "roadType" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "coords" TEXT NOT NULL,
    "lengthKm" REAL NOT NULL,
    "terrain" TEXT NOT NULL,
    "slope" REAL NOT NULL,
    "elevation" REAL NOT NULL,
    "bridge" BOOLEAN,
    "singleLane" BOOLEAN,
    "failureHistory" INTEGER NOT NULL,
    "baseCondition" TEXT NOT NULL,
    "sensorVibration" REAL NOT NULL,
    "sensorWaterLevel" REAL NOT NULL,
    "sensorSurface" REAL NOT NULL,
    "reportedStatus" TEXT,
    "reportReason" TEXT
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driver" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "cargoDetail" TEXT NOT NULL,
    "weightT" REAL NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "progressKm" REAL NOT NULL,
    "speedKmph" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "delayHours" REAL NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "trail" TEXT NOT NULL,
    "routeStatus" TEXT,
    "replacedRoute" TEXT,
    "lastMile" BOOLEAN,
    "community" TEXT,
    "contact" TEXT
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "cargoDetail" TEXT NOT NULL,
    "shipper" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "weightT" REAL NOT NULL,
    "dispatchedAt" TEXT NOT NULL,
    CONSTRAINT "shipments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "districtId" TEXT NOT NULL,
    "note" TEXT
);

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "location" TEXT,
    "segmentId" TEXT,
    "districtId" TEXT,
    "reporter" TEXT NOT NULL,
    "reporterRole" TEXT NOT NULL,
    "photoName" TEXT,
    "photoSeverity" TEXT,
    "photoConfidence" REAL,
    "status" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" REAL NOT NULL,
    "synced" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "alert_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "time" REAL NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "segmentId" TEXT,
    "read" BOOLEAN,
    "resolved" BOOLEAN
);

-- CreateTable
CREATE TABLE "weather_points" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "rainNow" REAL NOT NULL,
    "tempC" REAL NOT NULL,
    "forecast" TEXT NOT NULL,
    "fetchedAt" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "districtId" TEXT NOT NULL PRIMARY KEY,
    "medicine" REAL NOT NULL,
    "food" REAL NOT NULL,
    "fuel" REAL NOT NULL,
    "construction" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipper" TEXT NOT NULL,
    "fromDistrict" TEXT NOT NULL,
    "toDistrict" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "weightT" REAL NOT NULL,
    "vehicleId" TEXT,
    "status" TEXT NOT NULL,
    "lastMile" BOOLEAN NOT NULL,
    "communityCarrier" TEXT,
    "warehouseOut" BOOLEAN,
    "depotReached" BOOLEAN,
    "villageReceived" BOOLEAN,
    "createdAt" REAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
