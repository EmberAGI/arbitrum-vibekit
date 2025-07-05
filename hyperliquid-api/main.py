#!/usr/bin/env python3
"""
Simple Hyperliquid Trading Signal API
Receives trading signals and executes them with automatic TP/SL management
"""

import os
import time
import threading
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from hyperliquid.utils import constants
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from eth_account import Account
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Flask app
app = Flask(__name__)

# Global variables for tracking positions
active_positions = {}
position_monitor_thread = None
monitoring_active = False

class HyperliquidTrader:
    def __init__(self, private_key, vault_address, testnet=False):
        self.private_key = private_key
        self.vault_address = vault_address
        base_url = "https://api.hyperliquid-testnet.xyz"
        
        # Create wallet from private key
        self.wallet = Account.from_key(private_key)
        
        # Initialize exchange and info objects properly
        # For vault trading, we need to provide the wallet and vault address
        self.exchange = Exchange(self.wallet, base_url, vault_address=vault_address)
        self.info = Info(base_url, skip_ws=True)
        
        # Cache for asset specifications
        self._asset_specs = None
    
    def get_asset_specs(self):
        """Get asset specifications including size decimals"""
        if self._asset_specs is None:
            try:
                meta = self.info.meta()
                self._asset_specs = {}
                
                if 'universe' in meta:
                    for idx, asset in enumerate(meta['universe']):
                        self._asset_specs[asset['name']] = {
                            'asset_id': idx,
                            'sz_decimals': asset.get('szDecimals', 4),
                            'max_leverage': asset.get('maxLeverage', 1),
                            'only_isolated': asset.get('onlyIsolated', False)
                        }
                
                logger.info(f"Loaded asset specs for {len(self._asset_specs)} assets")
            except Exception as e:
                logger.error(f"Error getting asset specs: {e}")
                self._asset_specs = {}
        
        return self._asset_specs
    
    def get_min_order_size(self, symbol, current_price):
        """Get minimum order size for a symbol"""
        try:
            asset_specs = self.get_asset_specs()
            
            if symbol not in asset_specs:
                logger.warning(f"Asset {symbol} not found in specs, using default minimums")
                # Default minimum: $10 USD value and 0.0001 size
                min_usd_size = 10.0
                min_token_size = 0.0001
                return max(min_usd_size / current_price, min_token_size)
            
            spec = asset_specs[symbol]
            sz_decimals = spec['sz_decimals']
            
            # Minimum size based on szDecimals (1 lot = 10^(-szDecimals))
            min_lot_size = 10 ** (-sz_decimals)
            
            # Minimum USD value of $10
            min_usd_size = 10.0
            min_size_for_usd = min_usd_size / current_price
            
            # Use the larger of the two requirements
            min_size = max(min_lot_size, min_size_for_usd)
            
            logger.info(f"Min order size for {symbol}: lot_size={min_lot_size}, usd_size={min_size_for_usd:.8f}, final={min_size:.8f}")
            return min_size
            
        except Exception as e:
            logger.error(f"Error calculating min order size for {symbol}: {e}")
            # Conservative fallback
            return max(10.0 / current_price, 0.001)
    
    def validate_and_adjust_size(self, symbol, size, current_price):
        """Validate and adjust order size to meet minimum requirements"""
        try:
            min_size = self.get_min_order_size(symbol, current_price)
            
            if size < min_size:
                logger.warning(f"Order size {size:.8f} below minimum {min_size:.8f} for {symbol}, adjusting")
                adjusted_size = min_size * 1.01  # Add 1% buffer
                logger.info(f"Adjusted size from {size:.8f} to {adjusted_size:.8f}")
                return adjusted_size
            
            # Round to appropriate precision based on szDecimals
            asset_specs = self.get_asset_specs()
            if symbol in asset_specs:
                sz_decimals = asset_specs[symbol]['sz_decimals']
                # Round to sz_decimals precision
                adjusted_size = round(size, sz_decimals)
                if adjusted_size != size:
                    logger.info(f"Rounded size from {size:.8f} to {adjusted_size:.8f} based on {sz_decimals} decimals")
                return adjusted_size
            
            return size
            
        except Exception as e:
            logger.error(f"Error validating order size: {e}")
            return size
    
    def format_price(self, price, symbol):
        """Format price according to Hyperliquid requirements"""
        try:
            # Hyperliquid requires prices to have at most 5 significant digits
            # Use the same formatting as in their SDK
            formatted_price = float(f"{price:.5g}")
            
            # Additional rounding for spot vs perp assets
            asset_specs = self.get_asset_specs()
            if symbol in asset_specs:
                asset_id = asset_specs[symbol]['asset_id']
                # Spot assets have IDs >= 10000, use 8 decimals; perps use 6 decimals
                decimals = 8 if asset_id >= 10000 else 6
                sz_decimals = asset_specs[symbol]['sz_decimals']
                
                # Adjust decimals based on szDecimals as per Hyperliquid SDK
                final_decimals = decimals - sz_decimals
                formatted_price = round(formatted_price, final_decimals)
            
            logger.info(f"Formatted price for {symbol}: {price:.8f} -> {formatted_price:.8f}")
            return formatted_price
            
        except Exception as e:
            logger.error(f"Error formatting price for {symbol}: {e}")
            # Fallback to basic 5 significant digits formatting
            return float(f"{price:.5g}")
    
    def get_market_price(self, symbol, is_buy):
        """Get a more accurate market price for aggressive orders"""
        try:
            # Get current mid price
            current_price = self.get_current_price(symbol)
            if not current_price:
                return None
            
            # For market orders, use a smaller slippage to avoid "invalid price" errors
            # Reduce from 5% to 2% to be more conservative
            slippage = 0.02
            
            if is_buy:
                market_price = current_price * (1 + slippage)
            else:
                market_price = current_price * (1 - slippage)
            
            # Format the price properly
            formatted_price = self.format_price(market_price, symbol)
            
            logger.info(f"Market price for {symbol}: mid={current_price:.6f}, market={formatted_price:.6f} ({'buy' if is_buy else 'sell'})")
            return formatted_price
            
        except Exception as e:
            logger.error(f"Error getting market price for {symbol}: {e}")
            return None
        
    def place_order(self, symbol, is_buy, size, price, order_type="limit"):
        """Place an order on Hyperliquid"""
        try:
            # Get proper market price for market orders
            if order_type == "market":
                market_price = self.get_market_price(symbol, is_buy)
                if market_price:
                    price = market_price
                else:
                    logger.warning(f"Could not get market price for {symbol}, using provided price with formatting")
                    price = self.format_price(price, symbol)
            else:
                # For limit orders, format the provided price
                price = self.format_price(price, symbol)
            
            # Validate and adjust size before placing order
            original_size = size
            size = self.validate_and_adjust_size(symbol, size, price)
            
            if size != original_size:
                logger.info(f"Size adjusted from {original_size:.8f} to {size:.8f} for {symbol}")
            
            logger.info(f"Placing order: {symbol}, is_buy={is_buy}, size={size}, price={price}")
            
            # Choose order type
            if order_type == "market":
                # Use IOC (Immediate or Cancel) for market orders
                order_type_param = {"limit": {"tif": "Ioc"}}
            else:
                # Use GTC (Good Till Cancel) for limit orders
                order_type_param = {"limit": {"tif": "Gtc"}}
            
            order_result = self.exchange.order(
                symbol, 
                is_buy, 
                size, 
                price, 
                order_type_param
            )
            
            logger.info(f"Order placed: {order_result}")
            return order_result
            
        except Exception as e:
            logger.error(f"Error placing order: {e}")
            return None
    
    def get_position(self, symbol):
        """Get current position for a symbol"""
        try:
            positions = self.info.user_state(self.vault_address)
            if positions and 'assetPositions' in positions:
                for pos in positions['assetPositions']:
                    if pos['position']['coin'] == symbol:
                        return pos
            return None
        except Exception as e:
            logger.error(f"Error getting position: {e}")
            return None
    
    def get_current_price(self, symbol):
        """Get current market price for a symbol"""
        try:
            all_mids = self.info.all_mids()
            logger.info(f"all_mids type: {type(all_mids)}, content: {all_mids}")
            
            if not isinstance(all_mids, dict):
                logger.error(f"all_mids is not a dict: {type(all_mids)}")
                return None
                
            if symbol in all_mids:
                price = float(all_mids[symbol])
                logger.info(f"Found price for {symbol}: {price}")
                return price
            else:
                logger.warning(f"Symbol {symbol} not found in all_mids. Available symbols: {list(all_mids.keys())}")
                return None
        except Exception as e:
            logger.error(f"Error getting price for {symbol}: {e}")
            return None
    
    def get_vault_balance(self):
        """Get vault balance and deposited amounts"""
        try:
            user_state = self.info.user_state(self.vault_address)
            logger.info(f"Vault user state: {user_state}")
            
            if not user_state:
                return None
            
            # Get total account value
            total_account_value = 0
            if 'marginSummary' in user_state:
                total_account_value = float(user_state['marginSummary'].get('accountValue', 0))
            
            # Get withdrawable balance (cash available)
            withdrawable = 0
            if 'withdrawable' in user_state:
                withdrawable = float(user_state['withdrawable'])
            
            vault_info = {
                'total_account_value': total_account_value,
                'withdrawable': withdrawable,
                'vault_address': self.vault_address
            }
            
            logger.info(f"Vault balance info: {vault_info}")
            return vault_info
            
        except Exception as e:
            logger.error(f"Error getting vault balance: {e}")
            return None
    
    def calculate_position_size(self, symbol, current_price, percentage=10.0):
        """Calculate position size based on percentage of vault balance"""
        try:
            vault_info = self.get_vault_balance()
            if not vault_info:
                logger.warning("Could not get vault balance, using default $100")
                fallback_size = 100.0 / current_price
                return 100.0, fallback_size
            
            # Use percentage of total account value
            total_value = vault_info['total_account_value']
            position_size_usd = total_value * (percentage / 100.0)
            
            # Calculate minimum position size for this asset
            min_order_size = self.get_min_order_size(symbol, current_price)
            min_position_usd = min_order_size * current_price
            
            # Ensure position size meets minimum requirements
            if position_size_usd < min_position_usd:
                logger.warning(f"Calculated position size ${position_size_usd:.2f} below minimum ${min_position_usd:.2f} for {symbol}")
                position_size_usd = min_position_usd * 1.1  # Add 10% buffer above minimum
                logger.info(f"Adjusted position size to ${position_size_usd:.2f}")
            
            position_size = position_size_usd / current_price
            
            # Final validation and adjustment
            position_size = self.validate_and_adjust_size(symbol, position_size, current_price)
            position_size_usd = position_size * current_price
            
            logger.info(f"Vault total value: ${total_value:.2f}, using {percentage}% = ${position_size_usd:.2f} = {position_size:.8f} {symbol}")
            
            return position_size_usd, position_size
            
        except Exception as e:
            logger.error(f"Error calculating position size: {e}")
            # Fallback to safe default
            min_size = self.get_min_order_size(symbol, current_price) if symbol else 0.001
            fallback_usd = min_size * current_price if min_size else 100.0
            return fallback_usd, min_size

    def close_position(self, symbol):
        """Close a position"""
        try:
            position = self.get_position(symbol)
            if not position:
                return None
                
            pos_size = float(position['position']['szi'])
            is_buy = pos_size < 0  # If short position, buy to close
            
            # Get market price for closing
            market_price = self.get_market_price(symbol, is_buy)
            if not market_price:
                market_price = self.get_current_price(symbol)
                if market_price:
                    market_price = self.format_price(market_price, symbol)
            
            if not market_price:
                logger.error(f"Could not get price for closing {symbol} position")
                return None
            
            # Use market order to close quickly
            close_result = self.place_order(
                symbol, 
                is_buy, 
                abs(pos_size), 
                market_price, 
                "market"
            )
            
            logger.info(f"Position closed: {close_result}")
            return close_result
            
        except Exception as e:
            logger.error(f"Error closing position: {e}")
            return None

def load_config():
    """Load configuration from environment variables"""
    private_key = os.getenv('HYPERLIQUID_PRIVATE_KEY')
    vault_address = os.getenv('VAULT_ADDRESS')
    testnet = os.getenv('TESTNET', 'false').lower() == 'true'
    
    if not private_key or not vault_address:
        raise ValueError("HYPERLIQUID_PRIVATE_KEY and VAULT_ADDRESS must be set in environment")
    
    return private_key, vault_address, testnet

def monitor_positions():
    """Background thread to monitor positions and execute TP/SL"""
    global monitoring_active, active_positions
    
    private_key, vault_address, testnet = load_config()
    trader = HyperliquidTrader(private_key, vault_address, testnet)
    
    while monitoring_active:
        try:
            for signal_id, trade_data in list(active_positions.items()):
                symbol = trade_data['symbol']
                tp1 = trade_data['tp1']
                tp2 = trade_data['tp2']
                sl = trade_data['sl']
                is_buy_signal = trade_data['is_buy']
                max_exit_time = trade_data['max_exit_time']
                
                # Get current price
                current_price = trader.get_current_price(symbol)
                if not current_price:
                    continue
                
                # Check if position still exists
                position = trader.get_position(symbol)
                if not position:
                    logger.info(f"Position for {symbol} no longer exists, removing from monitoring")
                    del active_positions[signal_id]
                    continue
                
                should_close = False
                close_reason = ""
                
                # Check exit conditions
                if is_buy_signal:
                    # For buy signals, close on price reaching TP or falling to SL
                    if current_price >= tp1:
                        should_close = True
                        close_reason = f"TP1 hit: {current_price} >= {tp1}"
                    elif current_price >= tp2:
                        should_close = True
                        close_reason = f"TP2 hit: {current_price} >= {tp2}"
                    elif current_price <= sl:
                        should_close = True
                        close_reason = f"SL hit: {current_price} <= {sl}"
                else:
                    # For sell signals, close on price falling to TP or rising to SL
                    if current_price <= tp1:
                        should_close = True
                        close_reason = f"TP1 hit: {current_price} <= {tp1}"
                    elif current_price <= tp2:
                        should_close = True
                        close_reason = f"TP2 hit: {current_price} <= {tp2}"
                    elif current_price >= sl:
                        should_close = True
                        close_reason = f"SL hit: {current_price} >= {sl}"
                
                # Check max exit time
                if datetime.now(timezone.utc) >= max_exit_time:
                    should_close = True
                    close_reason = "Max exit time reached"
                
                # Close position if needed
                if should_close:
                    logger.info(f"Closing position for {symbol}: {close_reason}")
                    close_result = trader.close_position(symbol)
                    
                    if close_result:
                        logger.info(f"Position closed successfully: {close_reason}")
                        del active_positions[signal_id]
                    
        except Exception as e:
            logger.error(f"Error in position monitoring: {e}")
        
        time.sleep(5)  # Check every 5 seconds

@app.route('/signal', methods=['POST'])
def receive_signal():
    """Receive and process trading signal"""
    try:
        # Get and validate JSON data
        signal_data = request.get_json()
        
        if not signal_data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        logger.info(f"Received signal data: {signal_data}")
        logger.info(f"Signal data type: {type(signal_data)}")
        
        # Validate that signal_data is a dictionary
        if not isinstance(signal_data, dict):
            return jsonify({'error': f'Invalid data format. Expected dict, got {type(signal_data)}'}), 400
        
        # Validate required fields
        required_fields = ['Signal Message', 'Token Mentioned', 'TP1', 'TP2', 'SL', 'Max Exit Time']
        for field in required_fields:
            if field not in signal_data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Extract signal data with error handling
        try:
            signal_message = signal_data['Signal Message'].lower()
            symbol = signal_data['Token Mentioned'].upper()
            tp1 = float(signal_data['TP1'])
            tp2 = float(signal_data['TP2'])
            sl = float(signal_data['SL'])
            current_price = float(signal_data.get('Current Price', 0))
            
            logger.info(f"Extracted basic data: {signal_message}, {symbol}, TP1={tp1}, TP2={tp2}, SL={sl}")
            
        except (KeyError, TypeError, ValueError) as e:
            logger.error(f"Error extracting basic signal data: {e}")
            return jsonify({'error': f'Error parsing signal data: {str(e)}'}), 400
        
        # Parse max exit time with detailed error handling
        try:
            max_exit_str = signal_data['Max Exit Time']
            logger.info(f"Max Exit Time raw data: {max_exit_str}, type: {type(max_exit_str)}")
            
            if isinstance(max_exit_str, dict) and '$date' in max_exit_str:
                date_string = max_exit_str['$date']
                logger.info(f"Parsing date string: {date_string}")
                max_exit_time = datetime.fromisoformat(date_string.replace('Z', '+00:00'))
            elif isinstance(max_exit_str, str):
                logger.info(f"Parsing direct date string: {max_exit_str}")
                max_exit_time = datetime.fromisoformat(max_exit_str.replace('Z', '+00:00'))
            else:
                raise ValueError(f"Invalid Max Exit Time format: {max_exit_str}")
                
            logger.info(f"Parsed max exit time: {max_exit_time}")
            
        except (KeyError, TypeError, ValueError) as e:
            logger.error(f"Error parsing Max Exit Time: {e}")
            return jsonify({'error': f'Error parsing Max Exit Time: {str(e)}'}), 400
        
        # Determine if it's a buy or sell signal
        is_buy = signal_message == 'buy'
        if signal_message not in ['buy', 'sell']:
            return jsonify({'error': f'Invalid signal message: {signal_message}. Must be "buy" or "sell"'}), 400
        
        # Load configuration and create trader
        try:
            private_key, vault_address, testnet = load_config()
            logger.info(f"Config loaded - vault: {vault_address}, testnet: {testnet}")
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return jsonify({'error': f'Configuration error: {str(e)}'}), 500
        
        try:
            trader = HyperliquidTrader(private_key, vault_address, testnet)
            logger.info("Trader initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing trader: {e}")
            return jsonify({'error': f'Trader initialization error: {str(e)}'}), 500
        
        # Get current price if not provided
        if current_price == 0:
            try:
                current_price = trader.get_current_price(symbol)
                logger.info(f"Retrieved current price for {symbol}: {current_price}")
                if not current_price:
                    return jsonify({'error': f'Could not get current price for {symbol}'}), 400
            except Exception as e:
                logger.error(f"Error getting current price: {e}")
                return jsonify({'error': f'Price fetch error: {str(e)}'}), 500
        
        # Calculate position size based on vault balance (10% by default)
        try:
            risk_percentage = float(os.getenv('VAULT_RISK_PERCENTAGE', '10.0'))
            position_size_usd, position_size = trader.calculate_position_size(symbol, current_price, risk_percentage)
            logger.info(f"Calculated position size: ${position_size_usd:.2f} = {position_size:.8f} {symbol}")
        except Exception as e:
            logger.error(f"Error calculating position size: {e}")
            return jsonify({'error': f'Position size calculation error: {str(e)}'}), 500
        
        # Place the order
        try:
            logger.info(f"Placing {signal_message} order for {symbol}: size={position_size}, price={current_price}")
            order_result = trader.place_order(symbol, is_buy, position_size, current_price, "market")
            logger.info(f"Order result: {order_result}")
            
            if not order_result:
                return jsonify({'error': 'Failed to place order - no result returned'}), 500
            
            if not isinstance(order_result, dict):
                logger.error(f"Order result is not a dict: {type(order_result)}, value: {order_result}")
                return jsonify({'error': f'Invalid order result format: {type(order_result)}'}), 500
            
            if order_result.get('status') != 'ok':
                return jsonify({'error': 'Failed to place order', 'details': order_result}), 500
                
        except Exception as e:
            logger.error(f"Error placing order: {e}")
            return jsonify({'error': f'Order placement error: {str(e)}'}), 500
        
        # Add to monitoring
        signal_id = f"{symbol}_{int(time.time())}"
        active_positions[signal_id] = {
            'symbol': symbol,
            'is_buy': is_buy,
            'tp1': tp1,
            'tp2': tp2,
            'sl': sl,
            'max_exit_time': max_exit_time,
            'entry_price': current_price,
            'order_result': order_result
        }
        
        # Start monitoring thread if not already running
        global position_monitor_thread, monitoring_active
        if not monitoring_active:
            monitoring_active = True
            position_monitor_thread = threading.Thread(target=monitor_positions, daemon=True)
            position_monitor_thread.start()
            logger.info("Position monitoring started")
        
        return jsonify({
            'status': 'success',
            'message': f'{signal_message.capitalize()} order placed for {symbol}',
            'signal_id': signal_id,
            'order_result': order_result,
            'position_size': position_size,
            'entry_price': current_price,
            'tp1': tp1,
            'tp2': tp2,
            'sl': sl
        })
        
    except Exception as e:
        logger.error(f"Error processing signal: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/status', methods=['GET'])
def get_status():
    """Get status of active positions"""
    return jsonify({
        'active_positions': len(active_positions),
        'monitoring_active': monitoring_active,
        'positions': active_positions
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.now(timezone.utc).isoformat()})

@app.route('/test-connection', methods=['GET'])
def test_connection():
    """Test Hyperliquid connection"""
    try:
        private_key, vault_address, testnet = load_config()
        trader = HyperliquidTrader(private_key, vault_address, testnet)
        
        # Test basic connection by getting all market prices
        all_mids = trader.info.all_mids()
        
        # Test vault balance
        vault_balance = trader.get_vault_balance()
        
        return jsonify({
            'status': 'success',
            'testnet': testnet,
            'vault_address': vault_address,
            'all_mids_type': str(type(all_mids)),
            'sample_prices': dict(list(all_mids.items())[:5]) if isinstance(all_mids, dict) else str(all_mids)[:200],
            'vault_balance': vault_balance
        })
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/vault-balance', methods=['GET'])
def get_vault_balance():
    """Get vault balance information"""
    try:
        private_key, vault_address, testnet = load_config()
        trader = HyperliquidTrader(private_key, vault_address, testnet)
        
        vault_info = trader.get_vault_balance()
        
        if not vault_info:
            return jsonify({'error': 'Could not retrieve vault balance'}), 500
        
        # Calculate position sizes for different risk percentages
        btc_price = trader.get_current_price('BTC')
        position_examples = {}
        
        if btc_price:
            for pct in [5, 10, 15, 20]:
                size_usd, size_btc = trader.calculate_position_size('BTC', btc_price, pct)
                position_examples[f'{pct}%'] = {
                    'usd': round(size_usd, 2),
                    'btc': round(size_btc, 8)
                }
        
        return jsonify({
            'vault_info': vault_info,
            'btc_price': btc_price,
            'position_size_examples': position_examples
        })
        
    except Exception as e:
        logger.error(f"Error getting vault balance: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/test-signal', methods=['POST'])
def test_signal():
    """Test endpoint to debug signal parsing"""
    try:
        logger.info(f"Request headers: {dict(request.headers)}")
        logger.info(f"Request data: {request.data}")
        logger.info(f"Request json: {request.json}")
        logger.info(f"Request get_json(): {request.get_json()}")
        
        return jsonify({
            'status': 'success',
            'headers': dict(request.headers),
            'data_type': str(type(request.data)),
            'json_data': request.get_json(),
            'json_type': str(type(request.get_json()))
        })
    except Exception as e:
        logger.error(f"Test endpoint error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/asset-specs', methods=['GET'])
def get_asset_specs():
    """Get asset specifications for debugging"""
    try:
        private_key, vault_address, testnet = load_config()
        trader = HyperliquidTrader(private_key, vault_address, testnet)
        
        asset_specs = trader.get_asset_specs()
        
        # Get current prices for major assets
        sample_assets = ['BTC', 'ETH', 'SOL', 'VIRTUAL']
        asset_info = {}
        
        for symbol in sample_assets:
            if symbol in asset_specs:
                current_price = trader.get_current_price(symbol)
                if current_price:
                    min_size = trader.get_min_order_size(symbol, current_price)
                    min_usd = min_size * current_price
                    
                    # Test price formatting
                    formatted_price = trader.format_price(current_price, symbol)
                    buy_market_price = trader.get_market_price(symbol, True)
                    sell_market_price = trader.get_market_price(symbol, False)
                    
                    asset_info[symbol] = {
                        'specs': asset_specs[symbol],
                        'current_price': current_price,
                        'formatted_price': formatted_price,
                        'buy_market_price': buy_market_price,
                        'sell_market_price': sell_market_price,
                        'min_order_size': min_size,
                        'min_order_usd': min_usd
                    }
        
        return jsonify({
            'all_specs': asset_specs,
            'sample_asset_info': asset_info
        })
        
    except Exception as e:
        logger.error(f"Error getting asset specs: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/test-price/<symbol>', methods=['GET'])
def test_price_formatting(symbol):
    """Test price formatting for a specific symbol"""
    try:
        private_key, vault_address, testnet = load_config()
        trader = HyperliquidTrader(private_key, vault_address, testnet)
        
        current_price = trader.get_current_price(symbol)
        if not current_price:
            return jsonify({'error': f'Could not get price for {symbol}'}), 404
        
        # Test various price formatting
        test_prices = [current_price, current_price * 1.05, current_price * 0.95]
        results = {}
        
        for i, test_price in enumerate(test_prices):
            formatted = trader.format_price(test_price, symbol)
            buy_market = trader.get_market_price(symbol, True)
            sell_market = trader.get_market_price(symbol, False)
            
            results[f'test_{i+1}'] = {
                'original': test_price,
                'formatted': formatted,
                'buy_market': buy_market,
                'sell_market': sell_market
            }
        
        asset_specs = trader.get_asset_specs()
        
        return jsonify({
            'symbol': symbol,
            'current_price': current_price,
            'asset_specs': asset_specs.get(symbol, {}),
            'price_tests': results
        })
        
    except Exception as e:
        logger.error(f"Error testing price formatting for {symbol}: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    try:
        # Load environment variables from .env file if it exists
        if os.path.exists('.env'):
            try:
                from dotenv import load_dotenv
                load_dotenv('.env')
            except ImportError:
                # If python-dotenv is not installed, manually read .env file
                with open('.env', 'r') as f:
                    for line in f:
                        if '=' in line and not line.startswith('#'):
                            key, value = line.strip().split('=', 1)
                            os.environ[key] = value
        
        # Test configuration
        private_key, vault_address, testnet = load_config()
        logger.info("Configuration loaded successfully")
        logger.info(f"Vault Address: {vault_address}")
        logger.info(f"Testnet: {testnet}")
        
        # Start Flask app
        logger.info("Starting Hyperliquid Trading Signal API...")
        app.run(host='0.0.0.0', port=5000, debug=False)
        
    except Exception as e:
        logger.error(f"Failed to start API: {e}")
        exit(1) 