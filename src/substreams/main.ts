import {
    createRequest,
    streamBlocks,
    createAuthInterceptor,
    createRegistry,
    fetchSubstream,
} from '@substreams/core';
import type { Package } from '@substreams/core/proto';
import type { Transport, Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { type IMessageTypeRegistry } from "@bufbuild/protobuf";
import { getCursor } from "./cursor";
import { isErrorRetryable } from "./error";
import { handleResponseMessage } from "./handlers";
import { Handlers } from "./types";
import { ENDPOINT, MODULE, SPKG, TOKEN } from './constants';

/*
    Entrypoint of the application.
    Because of the long-running connection, Substreams will disconnect from time to time.
    The application MUST handle disconnections and commit the provided cursor to avoid missing information.
*/
export const startSubstreams = async (handlers: Handlers, startBlock: number) => {
    const pkg: Package = await fetchPackage()
    const registry: IMessageTypeRegistry = createRegistry(pkg);
    const authInterceptor: Interceptor = createAuthInterceptor(TOKEN);

    if (!TOKEN || TOKEN === "<SUBSTREAMS-TOKEN>") {
        throw new Error("You haven't modified the 'TOKEN' variable assignment in 'src/substreams/constants.ts', please read the 'README.md#getting-started' for further details");
    }

    const transport = createConnectTransport({
        baseUrl: ENDPOINT,
        interceptors: [authInterceptor],
        useBinaryFormat: true,
        jsonOptions: {
            typeRegistry: registry,
        },
    });

    // The infite loop handles disconnections. Every time a disconnection error is thrown, the loop will automatically reconnect
    // and start consuming from the latest commited cursor.
    while (true) {
        try {
            await stream(pkg, registry, transport, handlers, startBlock);

            // Break out of the loop when the stream is finished
            break;
        } catch (e) {
            if (!isErrorRetryable(e)) {
                console.log(`A fatal error occurred: ${e}`)
                throw e
            }

            console.log(`A retryable error occurred (${e}), retrying after backoff`)
            console.log(e)
            // Add backoff from a an easy to use library
        }
    }
}

const fetchPackage = async () => {
    return await fetchSubstream(SPKG)
}

const stream = async (pkg: Package, registry: IMessageTypeRegistry, transport: Transport, handlers: Handlers, startBlock: number) => {
    const request = createRequest({
        substreamPackage: pkg,
        outputModule: MODULE,
        productionMode: false,
        startBlockNum: startBlock,
        //stopBlockNum: '+1'
        //startCursor: getCursor() ?? undefined
    });

    // Stream the blocks
    for await (const response of streamBlocks(transport, request)) {
        /*
            Decode the response and handle the message.
            There different types of response messages that you can receive. You can read more about the response message in the docs:
            https://substreams.streamingfast.io/documentation/consume/reliability-guarantees#the-response-format
        */
        handleResponseMessage(response.message, registry, handlers);
    }
}
