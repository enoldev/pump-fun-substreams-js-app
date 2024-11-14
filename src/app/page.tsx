'use client'

import { useEffect } from "react";
import { useState } from "react";
import { startSubstreams } from "../substreams/main";
import type { BlockScopedData, BlockUndoSignal, ModulesProgress } from '@substreams/core/proto';
import { type IMessageTypeRegistry } from "@bufbuild/protobuf";
import { getCursor, writeCursor } from "@/substreams/cursor";
import { Handlers } from "@/substreams/types";
import { SPKG, TOKEN } from "@/substreams/constants";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';
import "./page.css";

export default function Home() {

  // Keep state of errors
  const [error, setError] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>("7VR8w5qGc5mYcdscznMChDMdRHBeogko5TWCeDgZpump");
  const [startBlock, setStartBlock] = useState<number | null>(300870776);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [streamStarted, setStreamStarted] = useState<boolean>(false);

  /*
    Receive data from the Substreams
  */
  const blockScopeDataHandler = (response: BlockScopedData, registry: IMessageTypeRegistry) => {
    const output = response.output?.mapOutput;
    // IN PRODUCTION, commit the cursor of the stream.
    const cursor = response.cursor;

    if (output !== undefined) {
      const message = output.unpack(registry);
      if (message === undefined) {
        throw new Error(`Failed to unpack output of type ${output.typeUrl}`);
      }

      // Decode the data from the Substreams
      const outputAsJson = output.toJsonString({ typeRegistry: registry });

      // Parse the data into a JSON object.
      const obj = JSON.parse(outputAsJson)

      // Iterate over all the TradeEvents of Pump.fun.
      if (obj['tradeEventList'] !== null && obj['tradeEventList'] !== undefined) {
        for (let i = 0; i < obj['tradeEventList'].length; i++) {
          const tradeEvent = obj['tradeEventList'][i]
          if (tradeEvent.mint !== token) {
            continue
          }

          const price = tradeEvent.solAmount / parseFloat(tradeEvent.tokenAmount)
          console.log(price)
          setPriceHistory((prev) => [...prev, price])
        }
      }
    }
  }

  const blockUndoSignalHandler = (response: BlockUndoSignal) => {
    /*
      HANDLE IN PRODUCTION: this means a reorg has happened and you might have comitted wrong data to your application.
    */
  }

  const progressHandler = (message: ModulesProgress) => {
    console.log(`Progress: ${JSON.stringify(message)}`)
  }

  const createHandlers = (): Handlers => {
    return new Handlers(blockScopeDataHandler, blockUndoSignalHandler, progressHandler)
  }

  const executeSubstreams = async () => {
    try {
      console.log("Starting substreams")
      await startSubstreams(createHandlers(), startBlock!!);
    } catch (e) {
      setError(e);
      console.log(e)
    }
  }

  const clickStreamButton = () => {
    if (token !== null && startBlock !== null) {
      executeSubstreams();
      setStreamStarted(true);
    }
  }

  if (!TOKEN) {
    return <div style={{ color: 'black' }}>
      <h3>Please, get a Substreams token in https://thegraph.market before streaming data!</h3>
      <div>Once you have the token, go to <i>/src/substreams/constants.ts</i> and replace the <i>TOKEN</i> variable with your actual authentication token.</div>
    </div>
  }

  return (
    <div style={{ width: '100%', margin: '0 auto', borderRadius: '6px 6px 6px 6px', backgroundColor: '#0a0817' }}>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div><img src="https://staging.substreams.dev/static/images/substreams_logo_white.svg" width={300} /></div>
          <div><img src="https://pump.fun/logo.png" width={70} /></div>

        </div>
        <div className="box">
          <div style={{ padding: '15px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Pump.fun Token Address</div>
              <div><input type="text" onChange={e => setToken(e.target.value)} value={token} style={{ width: '100%' }} /></div>
            </div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Start Block</div>
              <div><input type="text" onChange={e => setStartBlock(parseInt(e.target.value))} value={startBlock} style={{ width: '100%' }} /></div>
            </div>
            <div><button onClick={clickStreamButton}>Stream!</button></div>
          </div>
        </div>
        <div style={{ width: '100%', margin: '0 auto', maxWidth: '900px' }}>
          <div style={{ textAlign: 'center', border: '1px solid #F3F3F3', borderRadius: '6px 6px 6px 6px', maxWidth: '300px', margin: '0 auto' }}>
            <div style={{ padding: '10px' }}>
              {streamStarted && error === null && <span style={{ color: 'green' }}>Substreams running.</span>}
              {streamStarted && error !== null && <span style={{ color: 'red' }}>Substreams paused. Check console for errors.</span>}
              {!streamStarted && <span style={{ color: 'orange' }}>Substreams NOT started.</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: '7px' }}>
            <span style={{ fontSize: '26px', fontWeight: 'bold' }}>Latest Price: </span>
            {priceHistory.length === 0 && <i>Waiting for Price...</i>}
            {priceHistory.length > 0 && <b>{priceHistory[priceHistory.length - 1]}</b>}
          </div>
          <LineChart width={900} height={400} style={{ width: '100%', margin: '0 auto' }} data={priceHistory.map((idx, price) => {
            return { 'name': 'Token', 'uv': idx, pv: price }
          })}>
            <Line type="monotone" dataKey="uv" stroke="#8884d8" />
            <CartesianGrid stroke="#ccc" />
            <XAxis dataKey="name" />
            <YAxis />
          </LineChart>
        </div>
      </div>
    </div>
  );
}
