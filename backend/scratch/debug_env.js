require('dotenv').config();
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'PRESENT' : 'MISSING');
if (process.env.DATABASE_URL) {
  console.log('Value starts with:', process.env.DATABASE_URL.slice(0, 20));
}
