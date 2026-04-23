interface AgentSurfaceTagProps {
  tag: 'Swarm' | 'Workflow';
  className?: string;
}

export function AgentSurfaceTag({ tag, className }: AgentSurfaceTagProps) {
  const toneClassName =
    tag === 'Swarm'
      ? 'border-[#FD6731]/20 bg-[#FCE8DE] text-[#B14E27]'
      : 'border-[#DDC8B3] bg-[#FFF8F0] text-[#6F5A4C]';

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
