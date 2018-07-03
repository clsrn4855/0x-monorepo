import { schemas } from '@0xproject/json-schemas';
import { Order, SignedOrder } from '@0xproject/types';
import { BigNumber } from '@0xproject/utils';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { ContractAbi, LogWithDecodedArgs } from 'ethereum-types';
import * as _ from 'lodash';

import { artifacts } from '../artifacts';
import { methodOptsSchema } from '../schemas/method_opts_schema';
import { orderTxOptsSchema } from '../schemas/order_tx_opts_schema';
import { txOptsSchema } from '../schemas/tx_opts_schema';
import { BlockRange, EventCallback, IndexedFilterValues, MethodOpts, OrderInfo, OrderTransactionOpts } from '../types';
import { assert } from '../utils/assert';
import { decorators } from '../utils/decorators';

import { ContractWrapper } from './contract_wrapper';
import { ExchangeContract, ExchangeEventArgs, ExchangeEvents } from './generated/exchange';

/**
 * This class includes all the functionality related to calling methods and subscribing to
 * events of the 0x Exchange smart contract.
 */
export class ExchangeWrapper extends ContractWrapper {
    public abi: ContractAbi = artifacts.Exchange.compilerOutput.abi;
    private _exchangeContractIfExists?: ExchangeContract;
    private _contractAddressIfExists?: string;
    private _zrxContractAddressIfExists?: string;
    constructor(
        web3Wrapper: Web3Wrapper,
        networkId: number,
        contractAddressIfExists?: string,
        zrxContractAddressIfExists?: string,
        blockPollingIntervalMs?: number,
    ) {
        super(web3Wrapper, networkId, blockPollingIntervalMs);
        this._contractAddressIfExists = contractAddressIfExists;
        this._zrxContractAddressIfExists = zrxContractAddressIfExists;
    }
    /**
     * Retrieve the available asset proxies.
     * @param   proxySignature The 4 bytes signature of an asset proxy
     * @param   methodOpts     Optional arguments this method accepts.
     * @return  The address of an asset proxy for a given signature
     */
    public async getAssetProxieBySignatureAsync(proxySignature: string, methodOpts?: MethodOpts): Promise<string> {
        assert.isHexString('proxySignature', proxySignature);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeContract = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        const assetProxy = await exchangeContract.getAssetProxy.callAsync(proxySignature, txData, defaultBlock);
        return assetProxy;
    }
    /**
     * Retrieve the takerAmount of an order that has already been filled.
     * @param   orderHash    The hex encoded orderHash for which you would like to retrieve the filled takerAmount.
     * @param   methodOpts   Optional arguments this method accepts.
     * @return  The amount of the order (in taker tokens) that has already been filled.
     */
    public async getFilledTakerAmountAsync(orderHash: string, methodOpts?: MethodOpts): Promise<BigNumber> {
        assert.doesConformToSchema('orderHash', orderHash, schemas.orderHashSchema);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeContract = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        let fillAmountInBaseUnits = await exchangeContract.filled.callAsync(orderHash, txData, defaultBlock);
        // Wrap BigNumbers returned from web3 with our own (later) version of BigNumber
        fillAmountInBaseUnits = new BigNumber(fillAmountInBaseUnits);
        return fillAmountInBaseUnits;
    }
    /**
     * Retrieve the current context address
     * @param   methodOpts   Optional arguments this method accepts.
     * @return  Current context address
     */
    public async getCurrentContextAddressAsync(methodOpts?: MethodOpts): Promise<string> {
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeContract = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        const currentContextAddress = await exchangeContract.currentContextAddress.callAsync(txData, defaultBlock);
        return currentContextAddress;
    }
    /**
     * Retrieve the version
     * @param   methodOpts   Optional arguments this method accepts.
     * @return  Version
     */
    public async getVersionAsync(methodOpts?: MethodOpts): Promise<string> {
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeContract = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        const version = await exchangeContract.VERSION.callAsync(txData, defaultBlock);
        return version;
    }
    /**
     * Retrieve the order epoch
     * @param   makerAddress  Maker address
     * @param   senderAddress Sender address
     * @param   methodOpts    Optional arguments this method accepts.
     * @return  Version
     */
    public async getOrderEpochAsync(
        makerAddress: string,
        senderAddress: string,
        methodOpts?: MethodOpts,
    ): Promise<BigNumber> {
        assert.isETHAddressHex('makerAddress', makerAddress);
        assert.isETHAddressHex('senderAddress', senderAddress);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeContract = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        const orderEpoch = await exchangeContract.orderEpoch.callAsync(
            makerAddress,
            senderAddress,
            txData,
            defaultBlock,
        );
        return orderEpoch;
    }
    /**
     * Check if the order has been cancelled.
     * @param   orderHash    The hex encoded orderHash for which you would like to retrieve the
     *                       cancelled takerAmount.
     * @param   methodOpts   Optional arguments this method accepts.
     * @return  If the order has been cancelled.
     */
    public async isCancelledAsync(orderHash: string, methodOpts?: MethodOpts): Promise<boolean> {
        assert.doesConformToSchema('orderHash', orderHash, schemas.orderHashSchema);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeContract = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        const isCancelled = await exchangeContract.cancelled.callAsync(orderHash, txData, defaultBlock);
        return isCancelled;
    }
    /**
     * Fills a signed order with an amount denominated in baseUnits of the taker asset.
     * @param   signedOrder                                 An object that conforms to the SignedOrder interface.
     * @param   fillTakerTokenAmount                        The amount of the order (in taker tokens baseUnits) that
     *                                                      you wish to fill.
     * @param   shouldThrowOnInsufficientBalanceOrAllowance Whether or not you wish for the contract call to throw
     *                                                      if upon execution the tokens cannot be transferred.
     * @param   takerAddress                                The user Ethereum address who would like to fill this order.
     *                                                      Must be available via the supplied Provider
     *                                                      passed to 0x.js.
     * @param   orderTransactionOpts                        Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async fillOrderAsync(
        signedOrder: SignedOrder,
        fillTakerTokenAmount: BigNumber,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrder', signedOrder, schemas.signedOrderSchema);
        assert.isValidBaseUnitAmount('fillTakerTokenAmount', fillTakerTokenAmount);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();

        const txHash = await exchangeInstance.fillOrder.sendTransactionAsync(
            signedOrder,
            fillTakerTokenAmount,
            signedOrder.signature,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * No-throw version of fillOrderAsync
     * @param   signedOrder                                 An object that conforms to the SignedOrder interface.
     * @param   fillTakerTokenAmount                        The amount of the order (in taker tokens baseUnits) that
     *                                                      you wish to fill.
     * @param   shouldThrowOnInsufficientBalanceOrAllowance Whether or not you wish for the contract call to throw
     *                                                      if upon execution the tokens cannot be transferred.
     * @param   takerAddress                                The user Ethereum address who would like to fill this order.
     *                                                      Must be available via the supplied Provider
     *                                                      passed to 0x.js.
     * @param   orderTransactionOpts                        Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async fillOrderNoThrowAsync(
        signedOrder: SignedOrder,
        fillTakerTokenAmount: BigNumber,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrder', signedOrder, schemas.signedOrderSchema);
        assert.isValidBaseUnitAmount('fillTakerTokenAmount', fillTakerTokenAmount);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();

        const txHash = await exchangeInstance.fillOrderNoThrow.sendTransactionAsync(
            signedOrder,
            fillTakerTokenAmount,
            signedOrder.signature,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Attempts to fill a specific amount of an order. If the entire amount specified cannot be filled,
     * the fill order is abandoned.
     * @param   signedOrder                                 An object that conforms to the SignedOrder interface.
     * @param   takerAssetFillAmount                        The amount of the order (in taker asset baseUnits) that
     *                                                      you wish to fill.
     * @param   takerAddress                                The user Ethereum address who would like to fill this order.
     *                                                      Must be available via the supplied Provider
     *                                                      passed to 0x.js.
     * @param   orderTransactionOpts                        Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async fillOrKillOrderAsync(
        signedOrder: SignedOrder,
        takerAssetFillAmount: BigNumber,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrder', signedOrder, schemas.signedOrderSchema);
        assert.isValidBaseUnitAmount('takerAssetFillAmount', takerAssetFillAmount);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();

        const txHash = await exchangeInstance.fillOrKillOrder.sendTransactionAsync(
            signedOrder,
            takerAssetFillAmount,
            signedOrder.signature,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Executes tehe transaction
     * @param   salt                  Salt
     * @param   signerAddress         Signer address
     * @param   data                  Transaction data
     * @param   signature             Signature
     * @param   senderAddress         Sender address
     * @param   orderTransactionOpts  Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async executeTransactionAsync(
        salt: BigNumber,
        signerAddress: string,
        data: string,
        signature: string,
        senderAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.isBigNumber('salt', salt);
        assert.isETHAddressHex('signerAddress', signerAddress);
        assert.isHexString('data', data);
        assert.isHexString('signature', signature);
        await assert.isSenderAddressAsync('senderAddress', senderAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedSenderAddress = senderAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();

        const txHash = await exchangeInstance.executeTransaction.sendTransactionAsync(
            salt,
            signerAddress,
            data,
            signature,
            {
                from: normalizedSenderAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Batch version of fillOrderAsync. Executes multiple fills atomically in a single transaction.
     * @param   signedOrders                                    An array of signed orders to fill.
     * @param   takerAssetFillAmounts                           The amounts of the orders (in taker asset baseUnits) that
     *                                                          you wish to fill.
     * @param   takerAddress                                    The user Ethereum address who would like to fill
     *                                                          these orders. Must be available via the supplied
     *                                                          Provider passed to 0x.js.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async batchFillOrdersAsync(
        signedOrders: SignedOrder[],
        takerAssetFillAmounts: BigNumber[],
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrders', signedOrders, schemas.signedOrdersSchema);
        _.forEach(takerAssetFillAmounts, takerAssetFillAmount =>
            assert.isBigNumber('takerAssetFillAmount', takerAssetFillAmount),
        );
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const signatures = _.map(signedOrders, signedOrder => signedOrder.signature);
        const txHash = await exchangeInstance.batchFillOrders.sendTransactionAsync(
            signedOrders,
            takerAssetFillAmounts,
            signatures,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Synchronously executes multiple calls of fillOrder until total amount of makerAsset is bought by taker.
     * @param   signedOrders                                    An array of signed orders to fill.
     * @param   makerAssetFillAmount                            Maker asset fill amount.
     * @param   takerAddress                                    The user Ethereum address who would like to fill
     *                                                          these orders. Must be available via the supplied
     *                                                          Provider passed to 0x.js.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async marketBuyOrdersAsync(
        signedOrders: SignedOrder[],
        makerAssetFillAmount: BigNumber,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrders', signedOrders, schemas.signedOrdersSchema);
        assert.isBigNumber('makerAssetFillAmount', makerAssetFillAmount);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const signatures = _.map(signedOrders, signedOrder => signedOrder.signature);
        const txHash = await exchangeInstance.marketBuyOrders.sendTransactionAsync(
            signedOrders,
            makerAssetFillAmount,
            signatures,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Synchronously executes multiple calls of fillOrder until total amount of makerAsset is bought by taker.
     * @param   signedOrders                                    An array of signed orders to fill.
     * @param   takerAssetFillAmount                            Taker asset fill amount.
     * @param   takerAddress                                    The user Ethereum address who would like to fill
     *                                                          these orders. Must be available via the supplied
     *                                                          Provider passed to 0x.js.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async marketSellOrdersAsync(
        signedOrders: SignedOrder[],
        takerAssetFillAmount: BigNumber,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrders', signedOrders, schemas.signedOrdersSchema);
        assert.isBigNumber('takerAssetFillAmount', takerAssetFillAmount);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const signatures = _.map(signedOrders, signedOrder => signedOrder.signature);
        const txHash = await exchangeInstance.marketSellOrders.sendTransactionAsync(
            signedOrders,
            takerAssetFillAmount,
            signatures,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * No throw version of marketBuyOrdersAsync
     * @param   signedOrders                                    An array of signed orders to fill.
     * @param   makerAssetFillAmount                            Maker asset fill amount.
     * @param   takerAddress                                    The user Ethereum address who would like to fill
     *                                                          these orders. Must be available via the supplied
     *                                                          Provider passed to 0x.js.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async marketBuyOrdersNoThrowAsync(
        signedOrders: SignedOrder[],
        makerAssetFillAmount: BigNumber,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrders', signedOrders, schemas.signedOrdersSchema);
        assert.isBigNumber('makerAssetFillAmount', makerAssetFillAmount);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const signatures = _.map(signedOrders, signedOrder => signedOrder.signature);
        const txHash = await exchangeInstance.marketBuyOrdersNoThrow.sendTransactionAsync(
            signedOrders,
            makerAssetFillAmount,
            signatures,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * No throw version of marketSellOrdersAsync
     * @param   signedOrders                                    An array of signed orders to fill.
     * @param   takerAssetFillAmount                            Taker asset fill amount.
     * @param   takerAddress                                    The user Ethereum address who would like to fill
     *                                                          these orders. Must be available via the supplied
     *                                                          Provider passed to 0x.js.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async marketSellOrdersNoThrowAsync(
        signedOrders: SignedOrder[],
        takerAssetFillAmount: BigNumber,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrders', signedOrders, schemas.signedOrdersSchema);
        assert.isBigNumber('takerAssetFillAmount', takerAssetFillAmount);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const signatures = _.map(signedOrders, signedOrder => signedOrder.signature);
        const txHash = await exchangeInstance.marketSellOrdersNoThrow.sendTransactionAsync(
            signedOrders,
            takerAssetFillAmount,
            signatures,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * No throw version of batchFillOrdersAsync
     * @param   signedOrders                                    An array of signed orders to fill.
     * @param   takerAssetFillAmounts                           The amounts of the orders (in taker asset baseUnits) that
     *                                                          you wish to fill.
     * @param   takerAddress                                    The user Ethereum address who would like to fill
     *                                                          these orders. Must be available via the supplied
     *                                                          Provider passed to 0x.js.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async batchFillOrdersNoThrowAsync(
        signedOrders: SignedOrder[],
        takerAssetFillAmounts: BigNumber[],
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrders', signedOrders, schemas.signedOrdersSchema);
        _.forEach(takerAssetFillAmounts, takerAssetFillAmount =>
            assert.isBigNumber('takerAssetFillAmount', takerAssetFillAmount),
        );
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const signatures = _.map(signedOrders, signedOrder => signedOrder.signature);
        const txHash = await exchangeInstance.batchFillOrdersNoThrow.sendTransactionAsync(
            signedOrders,
            takerAssetFillAmounts,
            signatures,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Batch version of fillOrKillOrderAsync. Executes multiple fills atomically in a single transaction.
     * @param   signedOrders                                    An array of signed orders to fill.
     * @param   takerAssetFillAmounts                           The amounts of the orders (in taker asset baseUnits) that
     *                                                          you wish to fill.
     * @param   takerAddress                                    The user Ethereum address who would like to fill
     *                                                          these orders. Must be available via the supplied
     *                                                          Provider passed to 0x.js.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async batchFillOrKillOrdersAsync(
        signedOrders: SignedOrder[],
        takerAssetFillAmounts: BigNumber[],
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('signedOrders', signedOrders, schemas.signedOrdersSchema);
        _.forEach(takerAssetFillAmounts, takerAssetFillAmount =>
            assert.isBigNumber('takerAssetFillAmount', takerAssetFillAmount),
        );
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const signatures = _.map(signedOrders, signedOrder => signedOrder.signature);
        const txHash = await exchangeInstance.batchFillOrKillOrders.sendTransactionAsync(
            signedOrders,
            takerAssetFillAmounts,
            signatures,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Batch version of cancelOrderAsync. Executes multiple cancels atomically in a single transaction.
     * @param   orders                                          An array of orders to cancel.
     * @param   orderTransactionOpts                            Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async batchCancelOrdersAsync(
        orders: Order[],
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('orders', orders, schemas.ordersSchema);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const makerAddresses = _.map(orders, order => order.makerAddress);
        const makerAddress = makerAddresses[0];
        await assert.isSenderAddressAsync('makerAddress', makerAddress, this._web3Wrapper);
        const normalizedMakerAddress = makerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const txHash = await exchangeInstance.batchCancelOrders.sendTransactionAsync(orders, {
            from: normalizedMakerAddress,
            gas: orderTransactionOpts.gasLimit,
            gasPrice: orderTransactionOpts.gasPrice,
        });
        return txHash;
    }
    /**
     * Match two complementary orders that have a profitable spread.
     * Each order is filled at their respective price point. However, the calculations are carried out as though
     * the orders are both being filled at the right order's price point.
     * The profit made by the left order goes to the taker (who matched the two orders).
     * @param leftSignedOrder         First order to match.
     * @param rightSignedOrder        Second order to match.
     * @param takerAddress      The address that sends the transaction and gets the spread.
     * @return Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async matchOrdersAsync(
        leftSignedOrder: SignedOrder,
        rightSignedOrder: SignedOrder,
        takerAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('leftSignedOrder', leftSignedOrder, schemas.signedOrderSchema);
        assert.doesConformToSchema('rightSignedOrder', rightSignedOrder, schemas.signedOrderSchema);
        await assert.isSenderAddressAsync('takerAddress', takerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = takerAddress.toLowerCase();
        // TODO(logvinov): Check that:
        // rightOrder.makerAssetData === leftOrder.takerAssetData;
        // rightOrder.takerAssetData === leftOrder.makerAssetData;
        const exchangeInstance = await this._getExchangeContractAsync();
        const txHash = await exchangeInstance.matchOrders.sendTransactionAsync(
            leftSignedOrder,
            rightSignedOrder,
            leftSignedOrder.signature,
            rightSignedOrder.signature,
            {
                from: normalizedTakerAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Approves a hash on-chain using any valid signature type.
     * After presigning a hash, the preSign signature type will become valid for that hash and signer.
     * @param hash          Hash to pre-sign
     * @param signerAddress Address that should have signed the given hash.
     * @param signature     Proof that the hash has been signed by signer.
     * @param senderAddress Address that should send the transaction.
     * @returns Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async preSignAsync(
        hash: string,
        signerAddress: string,
        signature: string,
        senderAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.isHexString('hash', hash);
        assert.isETHAddressHex('signerAddress', signerAddress);
        assert.isHexString('signature', signature);
        await assert.isSenderAddressAsync('senderAddress', senderAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedTakerAddress = senderAddress.toLowerCase();
        const exchangeInstance = await this._getExchangeContractAsync();
        const txHash = await exchangeInstance.preSign.sendTransactionAsync(hash, signerAddress, signature, {
            from: normalizedTakerAddress,
            gas: orderTransactionOpts.gasLimit,
            gasPrice: orderTransactionOpts.gasPrice,
        });
        return txHash;
    }
    /**
     * Checks if the signature is valid.
     * @param hash          Hash to pre-sign
     * @param signerAddress Address that should have signed the given hash.
     * @param signature     Proof that the hash has been signed by signer.
     * @param methodOpts    Optional arguments this method accepts.
     * @returns If the signature is valid
     */
    @decorators.asyncZeroExErrorHandler
    public async isValidSignatureAsync(
        hash: string,
        signerAddress: string,
        signature: string,
        methodOpts: MethodOpts = {},
    ): Promise<boolean> {
        assert.isHexString('hash', hash);
        assert.isETHAddressHex('signerAddress', signerAddress);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeInstance = await this._getExchangeContractAsync();
        const txData = {};
        const isValidSignature = await exchangeInstance.isValidSignature.callAsync(
            hash,
            signerAddress,
            signature,
            txData,
            methodOpts.defaultBlock,
        );
        return isValidSignature;
    }
    /**
     * Checks if the is allowed by the signer.
     * @param validatorAddress  Address of a validator
     * @param signerAddress     Address of a signer
     * @param methodOpts        Optional arguments this method accepts.
     * @returns If the validator is allowed
     */
    @decorators.asyncZeroExErrorHandler
    public async isAllowedValidatorAsync(
        signerAddress: string,
        validatorAddress: string,
        methodOpts: MethodOpts = {},
    ): Promise<boolean> {
        assert.isETHAddressHex('signerAddress', signerAddress);
        assert.isETHAddressHex('validatorAddress', validatorAddress);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const normalizedSignerAddress = signerAddress.toLowerCase();
        const normalizedValidatorAddress = validatorAddress.toLowerCase();
        const exchangeInstance = await this._getExchangeContractAsync();
        const txData = {};
        const isValidSignature = await exchangeInstance.allowedValidators.callAsync(
            normalizedSignerAddress,
            normalizedValidatorAddress,
            txData,
            methodOpts.defaultBlock,
        );
        return isValidSignature;
    }
    /**
     * Approves a hash on-chain using any valid signature type.
     * After presigning a hash, the preSign signature type will become valid for that hash and signer.
     * @param hash          Hash to check if pre-signed
     * @param signerAddress Address that should have signed the given hash.
     * @param methodOpts    Optional arguments this method accepts.
     * @returns Is pre-signed
     */
    @decorators.asyncZeroExErrorHandler
    public async isPreSignedAsync(hash: string, signerAddress: string, methodOpts: MethodOpts = {}): Promise<boolean> {
        assert.isHexString('hash', hash);
        assert.isETHAddressHex('signerAddress', signerAddress);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeInstance = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        const isPreSigned = await exchangeInstance.preSigned.callAsync(hash, signerAddress, txData, defaultBlock);
        return isPreSigned;
    }
    /**
     * Checks if transaction is already executed.
     * @param transactionHash  Transaction hash to check
     * @param signerAddress    Address that should have signed the given hash.
     * @param methodOpts       Optional arguments this method accepts.
     * @returns If transaction is already executed.
     */
    @decorators.asyncZeroExErrorHandler
    public async isTransactionExecutedAsync(transactionHash: string, methodOpts: MethodOpts = {}): Promise<boolean> {
        assert.isHexString('transactionHash', transactionHash);
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeInstance = await this._getExchangeContractAsync();
        const txData = {};
        const isExecuted = await exchangeInstance.transactions.callAsync(
            transactionHash,
            txData,
            methodOpts.defaultBlock,
        );
        return isExecuted;
    }
    /**
     * Get order info
     * @param order         Order
     * @param methodOpts    Optional arguments this method accepts.
     * @returns Order info
     */
    @decorators.asyncZeroExErrorHandler
    public async getOrderInfoAsync(order: Order, methodOpts?: MethodOpts): Promise<OrderInfo> {
        if (!_.isUndefined(methodOpts)) {
            assert.doesConformToSchema('methodOpts', methodOpts, methodOptsSchema);
        }
        const exchangeInstance = await this._getExchangeContractAsync();
        const defaultBlock = _.isUndefined(methodOpts) ? undefined : methodOpts.defaultBlock;
        const txData = {};
        const orderInfo = await exchangeInstance.getOrderInfo.callAsync(order, txData, defaultBlock);
        return orderInfo;
    }
    /**
     * Cancel a given order.
     * @param   order                   An object that conforms to the Order or SignedOrder interface.
     *                                  The order you would like to cancel.
     * @param   transactionOpts         Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async cancelOrderAsync(
        order: Order | SignedOrder,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.doesConformToSchema('order', order, schemas.orderSchema);
        await assert.isSenderAddressAsync('order.maker', order.makerAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedMakerAddress = order.makerAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const txHash = await exchangeInstance.cancelOrder.sendTransactionAsync(order, {
            from: normalizedMakerAddress,
            gas: orderTransactionOpts.gasLimit,
            gasPrice: orderTransactionOpts.gasPrice,
        });
        return txHash;
    }
    /**
     * Sets the signature validator approval
     * @param   validatorAddress        Validator contract address.
     * @param   isApproved              Boolean value to set approval to.
     * @param   senderAddress           Sender address.
     * @param   orderTransactionOpts    Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async setSignatureValidatorApprovalAsync(
        validatorAddress: string,
        isApproved: boolean,
        senderAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.isETHAddressHex('validatorAddress', validatorAddress);
        assert.isBoolean('isApproved', isApproved);
        await assert.isSenderAddressAsync('senderAddress', senderAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedSenderAddress = senderAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const txHash = await exchangeInstance.setSignatureValidatorApproval.sendTransactionAsync(
            validatorAddress,
            isApproved,
            {
                from: normalizedSenderAddress,
                gas: orderTransactionOpts.gasLimit,
                gasPrice: orderTransactionOpts.gasPrice,
            },
        );
        return txHash;
    }
    /**
     * Cancels all orders created by makerAddress with a salt less than or equal to the targetOrderEpoch
     * and senderAddress equal to msg.sender (or null address if msg.sender == makerAddress).
     * @param   targetOrderEpoch             Target order epoch.
     * @param   senderAddress                Address that should send the transaction.
     * @param   orderTransactionOpts         Optional arguments this method accepts.
     * @return  Transaction hash.
     */
    @decorators.asyncZeroExErrorHandler
    public async cancelOrdersUpToAsync(
        targetOrderEpoch: BigNumber,
        senderAddress: string,
        orderTransactionOpts: OrderTransactionOpts = {},
    ): Promise<string> {
        assert.isBigNumber('targetOrderEpoch', targetOrderEpoch);
        await assert.isSenderAddressAsync('senderAddress', senderAddress, this._web3Wrapper);
        assert.doesConformToSchema('orderTransactionOpts', orderTransactionOpts, orderTxOptsSchema, [txOptsSchema]);
        const normalizedSenderAddress = senderAddress.toLowerCase();

        const exchangeInstance = await this._getExchangeContractAsync();
        const txHash = await exchangeInstance.cancelOrdersUpTo.sendTransactionAsync(targetOrderEpoch, {
            from: normalizedSenderAddress,
            gas: orderTransactionOpts.gasLimit,
            gasPrice: orderTransactionOpts.gasPrice,
        });
        return txHash;
    }
    /**
     * Subscribe to an event type emitted by the Exchange contract.
     * @param   eventName           The exchange contract event you would like to subscribe to.
     * @param   indexFilterValues   An object where the keys are indexed args returned by the event and
     *                              the value is the value you are interested in. E.g `{maker: aUserAddressHex}`
     * @param   callback            Callback that gets called when a log is added/removed
     * @return Subscription token used later to unsubscribe
     */
    public subscribe<ArgsType extends ExchangeEventArgs>(
        eventName: ExchangeEvents,
        indexFilterValues: IndexedFilterValues,
        callback: EventCallback<ArgsType>,
    ): string {
        assert.doesBelongToStringEnum('eventName', eventName, ExchangeEvents);
        assert.doesConformToSchema('indexFilterValues', indexFilterValues, schemas.indexFilterValuesSchema);
        assert.isFunction('callback', callback);
        const exchangeContractAddress = this.getContractAddress();
        const subscriptionToken = this._subscribe<ArgsType>(
            exchangeContractAddress,
            eventName,
            indexFilterValues,
            artifacts.Exchange.compilerOutput.abi,
            callback,
        );
        return subscriptionToken;
    }
    /**
     * Cancel a subscription
     * @param   subscriptionToken Subscription token returned by `subscribe()`
     */
    public unsubscribe(subscriptionToken: string): void {
        this._unsubscribe(subscriptionToken);
    }
    /**
     * Cancels all existing subscriptions
     */
    public unsubscribeAll(): void {
        super._unsubscribeAll();
    }
    /**
     * Gets historical logs without creating a subscription
     * @param   eventName           The exchange contract event you would like to subscribe to.
     * @param   blockRange          Block range to get logs from.
     * @param   indexFilterValues   An object where the keys are indexed args returned by the event and
     *                              the value is the value you are interested in. E.g `{_from: aUserAddressHex}`
     * @return  Array of logs that match the parameters
     */
    public async getLogsAsync<ArgsType extends ExchangeEventArgs>(
        eventName: ExchangeEvents,
        blockRange: BlockRange,
        indexFilterValues: IndexedFilterValues,
    ): Promise<Array<LogWithDecodedArgs<ArgsType>>> {
        assert.doesBelongToStringEnum('eventName', eventName, ExchangeEvents);
        assert.doesConformToSchema('blockRange', blockRange, schemas.blockRangeSchema);
        assert.doesConformToSchema('indexFilterValues', indexFilterValues, schemas.indexFilterValuesSchema);
        const exchangeContractAddress = this.getContractAddress();
        const logs = await this._getLogsAsync<ArgsType>(
            exchangeContractAddress,
            eventName,
            blockRange,
            indexFilterValues,
            artifacts.Exchange.compilerOutput.abi,
        );
        return logs;
    }
    /**
     * Retrieves the Ethereum address of the Exchange contract deployed on the network
     * that the user-passed web3 provider is connected to.
     * @returns The Ethereum address of the Exchange contract being used.
     */
    public getContractAddress(): string {
        const contractAddress = this._getContractAddress(artifacts.Exchange, this._contractAddressIfExists);
        return contractAddress;
    }
    /**
     * Returns the ZRX token address used by the exchange contract.
     * @return Address of ZRX token
     */
    public getZRXTokenAddress(): string {
        const contractAddress = this._getContractAddress(artifacts.ZRXToken, this._zrxContractAddressIfExists);
        return contractAddress;
    }
    /**
     * Returns the ZRX asset data used by the exchange contract.
     * @return ZRX asset data
     */
    public async getZRXAssetDataAsync(): Promise<string> {
        const exchangeInstance = await this._getExchangeContractAsync();
        const ZRX_ASSET_DATA = exchangeInstance.ZRX_ASSET_DATA.callAsync();
        return ZRX_ASSET_DATA;
    }
    // tslint:disable:no-unused-variable
    private _invalidateContractInstances(): void {
        this.unsubscribeAll();
        delete this._exchangeContractIfExists;
    }
    // tslint:enable:no-unused-variable
    private async _getExchangeContractAsync(): Promise<ExchangeContract> {
        if (!_.isUndefined(this._exchangeContractIfExists)) {
            return this._exchangeContractIfExists;
        }
        const [abi, address] = await this._getContractAbiAndAddressFromArtifactsAsync(
            artifacts.Exchange,
            this._contractAddressIfExists,
        );
        const contractInstance = new ExchangeContract(
            abi,
            address,
            this._web3Wrapper.getProvider(),
            this._web3Wrapper.getContractDefaults(),
        );
        this._exchangeContractIfExists = contractInstance;
        return this._exchangeContractIfExists;
    }
} // tslint:disable:max-file-line-count
