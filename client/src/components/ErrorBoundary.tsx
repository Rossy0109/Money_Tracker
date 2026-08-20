import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] p-5">
          <section className="w-full max-w-lg rounded-[2rem] border border-[#d9e4db] bg-white p-8 text-center shadow-[0_24px_70px_rgba(16,53,47,.12)]">
            <AlertTriangle
              size={48}
              className="mx-auto mb-6 text-[#b54a35]"
            />

            <h1 className="text-xl font-semibold text-[#173f36]">
              একটি অপ্রত্যাশিত সমস্যা হয়েছে
            </h1>

            <p className="mt-3 text-sm leading-6 text-[#668076]">
              আপনার তথ্য নিরাপদ আছে। পৃষ্ঠাটি আবার লোড করে চেষ্টা করুন। সমস্যা থাকলে পরে আবার চেষ্টা করুন।
            </p>

            <button
              onClick={() => window.location.reload()}
              className="mx-auto mt-7 inline-flex items-center gap-2 rounded-xl bg-[#173f36] px-4 py-2.5 font-semibold text-white transition hover:bg-[#0f3028] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8bd5a0] focus-visible:ring-offset-2"
            >
              <RotateCcw size={16} />
              পৃষ্ঠাটি আবার লোড করুন
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
