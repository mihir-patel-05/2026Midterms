-- CreateEnum
CREATE TYPE "DemographicGeoType" AS ENUM ('NATION', 'STATE', 'COUNTY', 'CONGRESSIONAL_DISTRICT', 'COUNTY_DISTRICT_PART');

-- CreateTable
CREATE TABLE "area_demographics" (
    "id" TEXT NOT NULL,
    "geo_type" "DemographicGeoType" NOT NULL,
    "geoid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state_code" TEXT,
    "county_fips" TEXT,
    "district_code" TEXT,
    "congress" INTEGER,
    "acs_year" INTEGER NOT NULL,
    "catalog_version" TEXT NOT NULL,
    "estimates" JSONB NOT NULL,
    "moes" JSONB NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "ingestion_run_id" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_demographics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "area_demographics_acs_year_state_code_geo_type_idx" ON "area_demographics"("acs_year", "state_code", "geo_type");

-- CreateIndex
CREATE INDEX "area_demographics_ingestion_run_id_idx" ON "area_demographics"("ingestion_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "area_demographics_geo_type_geoid_acs_year_key" ON "area_demographics"("geo_type", "geoid", "acs_year");

-- AddForeignKey
ALTER TABLE "area_demographics" ADD CONSTRAINT "area_demographics_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_demographics" ADD CONSTRAINT "area_demographics_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ingestion_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
