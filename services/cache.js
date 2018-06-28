const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');


const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

//This function will be called when we need to run cache function otherwise, the caching will be occur
mongoose.Query.prototype.cache = function(options = {}){
    this.useCache = true;
    //Using this to create a nested hash
    //If key is not passed we handle that condition by entering empty string
    this.hashKey = JSON.stringify(options.key || "");
    return this;
}

mongoose.Query.prototype.exec = async function(){

    if(!this.useCache){
        return exec.apply(this,arguments);
    }

    //Object.assign is used to create a copy of object
    const key = JSON.stringify(
            Object.assign({}, this.getQuery(),{
            collection: this.mongooseCollection.name
        })
    )
    //See if we have value for 'key' in redis
    const cacheValue = await client.hget(this.hashKey, key);

    //If we do, return that
    if(cacheValue){
        const doc = JSON.parse(cacheValue);

        //This doc will return either array of objects or single object
        //We need to convert it to mongoose object and then send.

        return Array.isArray(doc)
        ? doc.map(d => new this.model(d))
        : new this.model(doc);
    }

    //Otherwise, issue the query and store the result in redis
    const result =  await exec.apply(this,arguments);
    
    client.hset(this.hashKey, key, JSON.stringify(result));
    
    //TO set expiration for a cahe value
    //client.set(key, JSON.stringify(result), 'EX', 10);
    
    return result;
}

module.exports = {
    clearHash(hashKey) {
        client.del(JSON.stringify(hashKey));
    }
}