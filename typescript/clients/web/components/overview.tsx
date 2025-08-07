import { motion } from 'framer-motion';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-0 leading-relaxed text-center max-w-xl">
        <h1 className="w-full">
          Welcome to the <span className="font-semibold">Vibekit</span> Frontend
        </h1>
        <h2 className="w-full"> For web3 Agents</h2>
      </div>
    </motion.div>
  );
};
