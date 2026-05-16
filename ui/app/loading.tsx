import { Spinner, SkeletonBlock } from '@/components/Spinner';

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <div className="h-14 bg-bg border-b border-border flex items-center px-4">
        <SkeletonBlock width={28} height={28} className="rounded-full" />
        <SkeletonBlock width={140} height={20} className="ml-3" />
        <SkeletonBlock width={180} height={32} className="ml-4 rounded-pill" />
        <div className="flex-1 mx-6">
          <SkeletonBlock width="100%" height={36} className="rounded-md max-w-[760px]" />
        </div>
        <SkeletonBlock width={140} height={28} className="rounded-full" />
      </div>
      <div className="h-10 bg-bg border-b border-border flex items-center px-6">
        <SkeletonBlock width={80} height={16} />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink3 text-sm">
          <Spinner size={18} className="text-brand" />
          Loading workspace…
        </div>
      </div>
    </div>
  );
}
