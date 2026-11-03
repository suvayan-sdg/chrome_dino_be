import mongoose from 'mongoose';

let cached: Promise<typeof mongoose> | null = null;

export async function connectMongo(uri: string): Promise<typeof mongoose> {
  if (cached) return cached;

  cached = mongoose
    .connect(uri, { retryWrites: true, w: 'majority' })
    .then(() => mongoose)
    .catch((err) => {
      cached = null;
      throw err;
    });

  return cached;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection?.readyState !== 0) {
    await mongoose.disconnect();
  }
}
