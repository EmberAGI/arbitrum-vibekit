interface AgentSurfaceTagProps {
  tag: 'Swarm' | 'Workflow';
  className?: string;
}

export function AgentSurfaceTag({ tag, className }: AgentSurfaceTagProps) {
  const toneClassName =
    tag === 'Swarm'
      ? 'border-[#7c3aed]/25 bg-[#7c3aed]/12 text-[#c4b5fd]'
      : 'border-white/10 bg-white/[0.06] text-gray-200';

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]',
        toneClassName,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tag}
    </span>
  );
}
