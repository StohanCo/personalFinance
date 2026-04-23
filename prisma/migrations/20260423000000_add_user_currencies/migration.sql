-- CreateTable
CREATE TABLE "UserCurrency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCurrency_userId_code_key" ON "UserCurrency"("userId", "code");

-- CreateIndex
CREATE INDEX "UserCurrency_userId_idx" ON "UserCurrency"("userId");

-- AddForeignKey
ALTER TABLE "UserCurrency" ADD CONSTRAINT "UserCurrency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
