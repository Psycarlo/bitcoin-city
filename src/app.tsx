import { BlockCity } from "@/components/block-city";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useChainFeed } from "@/hooks/use-chain-feed";
import { usePriceFeed } from "@/hooks/use-price-feed";

export const App = () => {
  useChainFeed();
  usePriceFeed();
  return (
    <TooltipProvider delay={300}>
      <BlockCity />
    </TooltipProvider>
  );
};
