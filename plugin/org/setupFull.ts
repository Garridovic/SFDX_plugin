
// tslint:disable-line:no-any
import { core, flags, SfdxCommand } from '@salesforce/command';
import { AnyJson } from '@salesforce/ts-types';
import chalk from 'chalk';
import * as child_process from 'child_process';
import cli from 'cli-ux';
import util = require('util');

const exec = util.promisify(child_process.exec);

// Initialize Messages with the current plugin directory
core.Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
// const messages = core.Messages.loadMessages('dreamOle19', 'org');

export default class SetupFull extends SfdxCommand {

	public static description = 'Create an org, deploy a package in it and setup some data';

	public static args = [{ name: 'package' }];

	protected static flagsConfig = {
		// flag with a value (-n, --name=VALUE)
		package: flags.string({
			required: false,
			description:
				'Id or alias of the package to be deployed'
		}),
		scratchusername: flags.string({
			required: false,
			description:
				'Username or alias of already created scratch org'
		}),
		permissionsetname: flags.string({
			required: false,
			description:
				'Permission set to be used'
		}),
		definitionfile: flags.filepath({
			required: false,
			default: 'config/project-scratch-def.json',
			description:
				'path to a scratch org definition file.  Default = config/project-scratch-def.json'
		}),
		hookfile: flags.filepath({
			required: false,
			description:
				'Code to be invoked after org setup is finished. Must be a path to a local file with code'
		}),
		deploy: flags.boolean({
			required: false,
			description:
				'Metadata to be deployed'
		}),
	};

	// Comment this out if your command does not require an org username
	protected static requiresUsername = true;

	// Comment this out if your command does not support a hub org username
	protected static supportsDevhubUsername = true;

	// Set this to true if your command requires a project workspace; 'requiresProject' is false by default
	protected static requiresProject = false;

	public async run(): Promise<AnyJson> {

		try {
			console.log(`Flags ${JSON.stringify(this.flags)}`);
			let scratchOrgUsername = this.flags.scratchusername;

			if ( !scratchOrgUsername ) {
				scratchOrgUsername = await this.createScratchOrg(this.flags.definitionfile);
				}

			if (this.flags.deploy) {
				await this.deployMetadata(scratchOrgUsername);
			}

			if ( this.flags.package ) {
				await this.deployPackage(this.flags.package, scratchOrgUsername);
			}

			if (this.flags.permissionsetname) {
				await this.applyPermisionSet(this.flags.permissionsetname, scratchOrgUsername);
			}

			if ( this.flags.hookfile) {
				await this.executeAnonymousCode(this.flags.hookfile, scratchOrgUsername);
			}

			this.outputGreenText('Proccess ended');
	} catch (e) {
		this.outputRedText(`Error produced ${e.stack}`);
		return JSON.parse(e.stack);
	}

		return null;
	}

	private async createScratchOrg(definitionFile: string){
		// Doc: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_force_org.htm
		const createOrgCommand: {username: string, orgId: string} = await this.executeCommand(`sfdx force:org:create --json -f ${definitionFile}`, 'Creating scratch org');

		await this.executeCommand(`sfdx force:user:password:generate --targetusername ${createOrgCommand.username} --json`, 'Generating UI password for the scratch org');

		const queryUserDetailsCommand: {loginUrl: string, username: string, password: string} = await this.executeCommand(`sfdx force:user:display -u ${createOrgCommand.username} --json`, 'Querying login user detailas');

		this.outputGreenText(`Org with ID ${createOrgCommand.orgId} created, login details:
		loginURL: ${queryUserDetailsCommand.loginUrl}
		username: ${queryUserDetailsCommand.username}
		password: ${queryUserDetailsCommand.password}`);

		return queryUserDetailsCommand.username;
	}
	private async deployMetadata(username: string){
		// Doc: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_force_source.htm#cli_reference_force_source
		await this.executeCommand(`sfdx force:source:push --targetusername  ${username} --json`, 'Pushing metadata to scratch org');
	}

	private async applyPermisionSet(permissionSetName: string, username: string) {
		// Doc: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_force_user.htm#cli_reference_force_user
		await this.executeCommand(`sfdx force:user:permset:assign --permsetname ${permissionSetName} -u ${username} --json`, 'Assigning permission set');

		this.outputGreenText(`Permission set ${this.flags.permissionsetname} assigned to username ${username}`);
	}

	private async deployPackage(packageVersionId: string, username: string){
		// Doc: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_force_package.htm#cli_reference_force_package
		const installPackageCommand = await this.executeCommand(`sfdx force:package:install -p ${packageVersionId} -u ${username} --json`, `Installing package ${packageVersionId} on username ${username}`);

		const installationRequestId = installPackageCommand.Id;
		this.outputGreenText(`Package installation request in progress. Install Request ID ${installationRequestId} `);

		this.ux.log();
		const waitUntilInstallationFinish = () => new Promise<string>(async (resolve, reject) => {
				const installationStatusCommand = await this.executeCommand(`sfdx force:package:install:report -i ${installationRequestId} -u ${username} --json`, 'Checking installation status');
				if (installationStatusCommand.Status === 'SUCCESS') {
						this.outputGreenText(`Package installation completed, status: ${installationStatusCommand.Status} `);
						resolve('SUCCESS');
					} else {
						this.outputYellowText(`Package installation not completed, status: ${installationStatusCommand.Status} `);
						reject(installationStatusCommand.Status);
					}

			});

		await this.retryMaxAttempsWithDelay(waitUntilInstallationFinish, 10000, 100);
	}

	private async executeAnonymousCode (file: string, username: string) {
		// Doc: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_force_apex.htm#cli_reference_force_apex

		const executeApexCommand = await this.executeCommand(`sfdx force:apex:execute -f ${file} -u ${username} --json`, 'Executing anonymous code');

		this.outputGreenText(`Anonymous code executed succesfully.
		Code execution logs:`);

		this.outputGrayText(`${executeApexCommand.logs}`)

		this.outputGreenText('Anonymous code executed succesfully.');
		

	}

	private retryMaxAttempsWithDelay<T>(workToDo: () => Promise<T>, delayMillis: number, maxAttempts: number, currentAttemtp: number = 0): Promise<T> {
			return new Promise<T>(async (resolve, reject) => {
				try {
					resolve( await workToDo());
				} catch (err) {
					if (currentAttemtp < maxAttempts) {
						await this.delay(delayMillis);
						try {
							// The class call itself through the module (same module) for the testing sake.
							// sinon can not spy a recursive function if it calls itself directly
							resolve( await this.retryMaxAttempsWithDelay(workToDo, delayMillis, maxAttempts, ++currentAttemtp));
						} catch (err) {
							reject(err);
						}
					} else {
						reject('Max attempts reached');
					}
				}
			});
		}

	// Utils

	private delay(time: number) {
			return new Promise(resolve => setTimeout(() => {
				resolve();
			}, time));
		}

	private async executeCommand(command: string, logMessage: string = 'Executing command...') {
		cli.action.start(logMessage);
		const commandResponse = await exec(command);
		cli.action.stop();
		if (commandResponse.stdout) {
			const success = JSON.parse(commandResponse.stdout);
			if (success.status === 0) {
				return success.result;
				}
			} else {
				throw new Error(JSON.parse(commandResponse.stdout));
			}
		}

	private outputGreenText(message: string) {
		this.ux.log(
			chalk.green(
				message
				)
			);
	}

	private outputGrayText(message: string) {
		this.ux.log(
			chalk.gray(
				message
				)
			);
	}

	private outputRedText(message: string) {
		this.ux.log(
			chalk.red(
				message
				)
			);
	}

	private outputYellowText(message: string) {
		this.ux.log(
			chalk.yellow(
				message
				)
			);
	}
}