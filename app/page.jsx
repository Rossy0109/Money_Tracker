import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-3xl font-bold mb-4">Foot Print of Money</h1>
      <p className="text-gray-600 mb-8 text-center">আপনার নিরাপদ আর্থিক বন্ধু</p>
      <Link href="/login" className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
        Get Started
      </Link>
    </div>
  );
}
