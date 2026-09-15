-- CreateTable
CREATE TABLE "PipelineReferenceImage" (
    "pipelineId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineReferenceImage_pkey" PRIMARY KEY ("pipelineId","mediaId")
);

-- CreateIndex
CREATE INDEX "PipelineReferenceImage_mediaId_pipelineId_idx" ON "PipelineReferenceImage"("mediaId", "pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineReferenceImage_pipelineId_position_key" ON "PipelineReferenceImage"("pipelineId", "position");

-- AddForeignKey
ALTER TABLE "PipelineReferenceImage" ADD CONSTRAINT "PipelineReferenceImage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineReferenceImage" ADD CONSTRAINT "PipelineReferenceImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
