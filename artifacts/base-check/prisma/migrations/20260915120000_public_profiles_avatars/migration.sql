-- AlterTable
ALTER TABLE "employee_profiles" ADD COLUMN     "avatar_updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "linkedin_url" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "pronouns" TEXT;

-- CreateTable
CREATE TABLE "employee_avatars" (
    "employee_profile_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "image_bytes" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_avatars_pkey" PRIMARY KEY ("employee_profile_id")
);

-- AddForeignKey
ALTER TABLE "employee_avatars" ADD CONSTRAINT "employee_avatars_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
