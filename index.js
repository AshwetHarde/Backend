const express = require("express");
const cors = require("cors");
const { Moralis } = require("moralis");
const { Connection, PublicKey } = require("@solana/web3.js");
const { getMint } = require("@solana/spl-token");
require("dotenv").config();
Moralis.start({ apiKey: process.env.MORALIS_API_KEY });

const app = express();
app.use(cors());
app.use(express.json());

async function fetchEvmToken(chain, address) {
  const metaResp = await Moralis.EvmApi.token.getTokenMetadata({
    chain,
    address,
  });
  const priceResp = await Moralis.EvmApi.token.getTokenPrice({
    chain,
    address,
  });
  const holdersResp = await Moralis.EvmApi.token.getTokenAddressHolders({
    chain,
    address,
    limit: 10,
  });

  return {
    meta: metaResp.toJSON(),
    price: priceResp.toJSON(),
    holders: holdersResp.toJSON(),
  };
}

async function fetchSolToken(address) {
  const rpcEndpoint = process.env.SOLANA_RPC_PRIMARY || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcEndpoint);
  const mintPubkey = new PublicKey(address);
  const mintInfo = await getMint(connection, mintPubkey);

  const supply = Number(mintInfo.supply) / 10 ** mintInfo.decimals;
  const mintDisabled = mintInfo.mintAuthority === null;
  const freezeDisabled = mintInfo.freezeAuthority === null;

  const largest = await connection.getTokenLargestAccounts(mintPubkey);
  const top10 = largest.value.slice(0, 10).map((acc) => ({
    address: acc.address,
    amount: Number(acc.amount) / 10 ** mintInfo.decimals,
  }));

  return {
    supply,
    decimals: mintInfo.decimals,
    mintDisabled,
    freezeDisabled,
    top10,
  };
}

function calculateRiskScore(data) {
  let score = 0;
  if (data.holders < 100) score += 30;
  if (data.liquidityUsd < 50000) score += 30;
  if (data.volumeUsd24h < 10000) score += 20;
  const top1 = data.holdersDistribution[0]?.amount || 0;
  if (top1 / data.totalSupply > 0.5) score += 20;
  const sumTop10 = data.holdersDistribution
    .slice(0, 10)
    .reduce((sum, h) => sum + h.amount, 0);
  if (sumTop10 / data.totalSupply > 0.7) score += 20;
  return Math.min(score, 100);
}

app.get("/api/scan", async (req, res) => {
  try {
    const { chain, address } = req.query;
    if (!chain || !address) {
      return res.status(400).json({ error: "chain and address required" });
    }

    let raw;
    if (chain === "sol") {
      raw = await fetchSolToken(address);
      raw.chain = "Solana";
    } else {
      const chainId = chain === "bsc" ? "0x38" : "0x1";
      raw = await fetchEvmToken(chainId, address);
      raw.chain = chain === "bsc" ? "BSC" : "Ethereum";
    }

    const scanData = {
      totalSupply: Number(raw.meta.totalSupply) / 10 ** raw.meta.decimals,
      holders: raw.holders.result?.length || raw.holders.total,
      priceUsd: raw.price.usdPrice || raw.price.price,
      liquidityUsd: raw.price.usdLiquidity,
      volumeUsd24h: raw.price.usd24hVolume,
      holdersDistribution: (raw.holders.result || raw.holders)
        .slice(0, 10)
        .map((h) => ({
          address: h.address,
          amount: Number(h.balance || h.amount) / 10 ** raw.meta.decimals,
        })),
    };
    scanData.riskScore = calculateRiskScore(scanData);
    scanData.riskCategory =
      scanData.riskScore < 30
        ? "Low"
        : scanData.riskScore < 70
        ? "Moderate"
        : "High";

    res.json({ success: true, data: scanData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/health", (req, res) => res.send("OK"));

app.get('/',(req,res)=>{
  res.send('welcome')
})

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  // Server started
  console.log('server started');
  
});

module.exports = app;
