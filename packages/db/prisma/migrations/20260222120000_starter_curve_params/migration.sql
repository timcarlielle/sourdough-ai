-- CreateTable
CREATE TABLE "starter_curve_params" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "peak_hours_after_feed" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "window_hours" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "sigma" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "interval_minutes" INTEGER NOT NULL DEFAULT 15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "starter_curve_params_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "starter_curve_params_user_id_key" ON "starter_curve_params"("user_id");

-- AddForeignKey
ALTER TABLE "starter_curve_params" ADD CONSTRAINT "starter_curve_params_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
