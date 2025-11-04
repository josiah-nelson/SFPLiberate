/**
 * Runtime stub for the Appwrite SDK when building the standalone distribution.
 *
 * The standalone build deliberately excludes Appwrite dependencies. If any of
 * these placeholders are invoked it indicates a feature that should only be
 * enabled for the Appwrite deployment target.
 */

interface TeamsList {
    teams: Array<{ name: string }>;
}

export class Client {
    setEndpoint(): this {
        return this;
    }

    setProject(): this {
        return this;
    }
}

export class Account {
    constructor(private readonly client: Client) {}

    async get(): Promise<never> {
        throw new Error('Appwrite account access is not available in standalone mode.');
    }

    async create(): Promise<never> {
        throw new Error('Account creation is only supported for Appwrite deployments.');
    }

    async createEmailPasswordSession(): Promise<never> {
        throw new Error('Authentication is disabled in standalone mode.');
    }

    async deleteSession(): Promise<never> {
        throw new Error('Authentication is disabled in standalone mode.');
    }

    async updatePrefs(): Promise<never> {
        throw new Error('Authentication is disabled in standalone mode.');
    }
}

export class Teams {
    constructor(private readonly client: Client) {}

    async list(): Promise<TeamsList> {
        throw new Error('Appwrite teams are not available in standalone mode.');
    }
}

export namespace Models {
    export type Preferences = Record<string, unknown>;

    export type User<P extends Preferences = Preferences> = {
        $id: string;
        email?: string;
        name?: string;
        labels?: string[];
        prefs: P;
    };
}
