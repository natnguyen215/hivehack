import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export default class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MapErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[#070a12]">
          <p className="text-sm font-medium text-slate-400">
            Map failed to load — please refresh
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
