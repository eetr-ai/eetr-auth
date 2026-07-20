import Link from 'next/link';
import { appName, appTagline } from '@/lib/shared';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 gap-4 px-4">
      <h1 className="text-3xl font-bold">{appName}</h1>
      <p className="text-fd-muted-foreground max-w-xl mx-auto">{appTagline}</p>
      <p>
        <Link href="/docs" className="font-medium underline">
          Read the documentation →
        </Link>
      </p>
    </div>
  );
}
