ModTools.addMaterial("mana", "Mana", "The essence of life itself!");
const ManaId = MaterialsHelper.findMaterialIndex("mana");

// in order food -> graphene
let MaterialConversionValues = [0.5, 1, 1, 1, 2, 3, 5, 10];

let Helpers = {};

Helpers.ticksPerDay = 2877;

Helpers.isBetweenHours = function(city, start, end){
    return (((city.simulation.time.timeSinceStart | 0) / 60 ) | 0) % 24 > start && 
    (((city.simulation.time.timeSinceStart | 0) / 60 ) | 0) % 24 < end
}

Helpers.isDay = function(city){
    return Helpers.isBetweenHours(city, 6, 18);
}

Helpers.getMaterialValue = function(material){
    if(typeof material == "string")
        material = MaterialsHelper.findMaterialIndex(material);
    if(material > 7)
        return 0;
    return MaterialConversionValues[material];
}

Helpers.convertMaterial = function(city, mat1, mat2, mat1Amt){
    if(!Helpers.hasEnoughOfMaterial(city, mat1, mat1Amt))
        return [0, 0];
    let conversionRate = Helpers.getMaterialValue(mat1) / Helpers.getMaterialValue(mat2);
    let prodAmt = conversionRate * mat1Amt;
    ModTools.consume(city, MaterialsHelper.findMaterialName(mat1), mat1Amt, mat1);
    ModTools.produce(city, MaterialsHelper.findMaterialName(mat2), prodAmt, mat2);

    return [mat1Amt, prodAmt];
}

Helpers.hasEnoughOfMaterial = function(city, material, amount){
    if(typeof material == "number")
        material = MaterialsHelper.findMaterialName(material);
    return city.materials[material] >= amount;
}

// Converts an amount that should be produced each day into an amount that should be produced each tick
// Not perfectly accurate as the number of ticks per day varies slightly (by +/- 1  per day)
Helpers.productionPerTick = function(perDay, timeMod, hoursPerDay){
    let perTick24Hr = perDay / Helpers.ticksPerDay;
    return perTick24Hr * (24/hoursPerDay) * timeMod;
}

ModTools.makeBuilding("ManaProducer", (superClass) => { return {
    doInit: function(){
        this.totalManaProduced = 0;
        this.test=0;
    },
    getTier: function(){
        return 0;
    },
    getGlobalManaMultiplier: function(){
        return 1;
    },
    getManaPerTick: function(){
        return this.getGlobalManaMultiplier() * 0.001 * ((Helpers.isDay(this.city) ? 3 : 2) + this.getTier()*3);
    },
    update: function(timeMod){
        if(this.isFirstTick == undefined){
            this.doInit();
            this.isFirstTick = false;
        }
        if((this.city.simulation.time.timeSinceStart|0)%(60*24)==0){
            console.log(this.test, timeMod);
            this.test = 0;
        } else {
            this.test += timeMod;
        }
        let manaToProduce = this.getManaPerTick() * timeMod;
        ModTools.produce(this.city, "mana", manaToProduce, ManaId);
        this.totalManaProduced += manaToProduce;


        //TODO: REMOVE
        ModTools.produce(this.city, "food", Helpers.productionPerTick(10000, timeMod, 24));
        ModTools.produce(this.city, "wood", Helpers.productionPerTick(10000, timeMod, 24));
    },
    get_possibleUpgrades: function() {
        return [buildingUpgrades_ManaFarmAdvanced];
    },
    addWindowInfoLines: function(){
        var _this = this;
        this.city.gui.windowAddInfoText(null,function() {
			return ("Producing " + _this.getManaPerTick() + " mana per tick...\n" + 
                    "Total mana produced: " + Math.floor(_this.totalManaProduced*100)/100);
        });
    }
};}, "spr_manafarm_basic",
function(queue){
    queue.addFloat(this.totalManaProduced);
},
function(queue){
    this.totalManaProduced = queue.readFloat();
    this.isFirstTick = false;
});

ModTools.makeBuildingUpgrade("ManaFarmAdvanced", {getTier: function(){return 1}}, (building)=>{building.getTier=function(){return 1}}, "spr_manafarm_advanced_middle",upgradeDisplayLayer.Middle)

ModTools.makeBuilding("AlchemyLab", (superClass) => { return {
    doInit: function(){
        this.totalMaterialsProduced = 0;
        this.materialFrom = 1;
        this.materialTo = 2;
        this.transmutePercent = 0;
        this.totalMaterialsConsumed = 0;
    },
    getTransmutationFromPerDay: function(){
        return 10;
    },
    getTransmutationToPerDay: function(){
        return this.getTransmutationFromPerDay() * (Helpers.getMaterialValue(this.materialFrom) / Helpers.getMaterialValue(this.materialTo));
    },
    update: function(timeMod){
        if(this.isFirstTick == undefined){
            this.doInit();
            this.isFirstTick = false;
        }
    },
    work: function(citizen, timeMod, shouldStopWorking){
		if(shouldStopWorking) {
			citizen.currentAction = 2;
			return;
		}
        let mults = this.city.simulation.happiness.actionSpeedModifier * citizen.get_educationSpeedModifier() * this.city.simulation.boostManager.currentGlobalBoostAmount;
        let consumeAmount = Helpers.productionPerTick(this.getTransmutationFromPerDay(), timeMod, 12);
        if(!Helpers.hasEnoughOfMaterial(this.city, "mana", consumeAmount))
            return; // not enough mana
        ModTools.consume(this.city, "mana", consumeAmount);
        // do the convertMaterial shenanigans
        let convertAmounts = Helpers.convertMaterial(this.city, this.materialFrom, this.materialTo, consumeAmount);
        this.totalMaterialsProduced += convertAmounts[0];
        this.totalMaterialsConsumed += convertAmounts[1];
    },
    get_possibleUpgrades: function() {
        return [];
    },
    addWindowInfoLines: function(){
        var _this = this;
        this.city.gui.windowAddInfoText(null,function() {
            let fromText = MaterialsHelper.findMaterialDisplayName(_this.materialFrom);
            if(fromText == "!!! missing text !!!")
                fromText = "Refined Metal";
            let toText = MaterialsHelper.findMaterialDisplayName(_this.materialTo);
            if(toText == "!!! missing text !!!")
                toText = "Refined Metal";
			return (`Transmuting ${_this.getTransmutationFromPerDay()} ${fromText} ` +
                    `into ${Math.floor(_this.getTransmutationToPerDay()*100)/100} ${toText} every day (per worker)\n` + 
                    "Total materials produced: " + Math.floor(_this.totalMaterialsProduced*100)/100 + "\n" + 
                    "Total materials consumed: " + Math.floor(_this.totalMaterialsConsumed*100)/100);
        });

        
        let allMaterialsList = MaterialsHelper.materialNames

        this.city.gui.windowAddInfoText("Input material:");
        
        for (let i = 0; i < MaterialConversionValues.length; i++) {
            const name = allMaterialsList[i];
            const _i = i;
            let texture = Resources.getTexture("spr_resource_"+allMaterialsList[i])
            if (!texture.valid) texture = Resources.getTexture("spr_resource_"+allMaterialsList[i].toLowerCase())
            if (texture.valid) {
                let depositButton = this.city.gui.windowAddSimpleButton(texture, () => {
                    _this.materialFrom = _i;
                }, " ")
                depositButton.container.padding = { left : 4, right : 5, top : 4, bottom : 1}
                depositButton.rect.width = 18
                depositButton.rect.height = 18
                depositButton.isActive = function() {
                    return _this.materialFrom == _i;
                }
            }
        }

        this.city.gui.windowSimpleButtonContainer = null

        this.city.gui.windowAddInfoText("Output material:");

        for (let i = 0; i < MaterialConversionValues.length; i++) {
            const name = allMaterialsList[i];
            const _i = i;
            let texture = Resources.getTexture("spr_resource_"+allMaterialsList[i])
            if (!texture.valid) texture = Resources.getTexture("spr_resource_"+allMaterialsList[i].toLowerCase())
            if (texture.valid) {
                let depositButton = this.city.gui.windowAddSimpleButton(texture, () => {
                    _this.materialTo = _i;
                }, " ")
                depositButton.container.padding = { left : 4, right : 5, top : 4, bottom : 1}
                depositButton.rect.width = 18
                depositButton.rect.height = 18
                depositButton.isActive = function() {
                    return _this.materialTo == _i;
                }
            }
        }
    }
};}, "spr_alchemy_lab_basic",
function(queue){
    queue.addFloat(this.totalMaterialsProduced);
    queue.addInt(this.materialFrom);
    queue.addInt(this.materialTo);
    queue.addFloat(this.transmutePercent);
    queue.addFloat(this.totalMaterialsConsumed);
},
function(queue){
    this.totalMaterialsProduced = queue.readFloat();
    this.materialFrom = queue.readInt();
    this.materialTo = queue.readInt();
    this.transmutePercent = queue.readFloat();
    this.totalMaterialsConsumed = queue.readFloat();
    this.isFirstTick = false;
});



// ModTools.makeBuilding("TempHouse", (superClass) => { return {
//     walkAround: function(citizen, stepsInBuilding) {
//         if (random_Random.getInt(3) == 1) {
//             citizen.changeFloor();
//             return;
//         }

//         //Slowly move in the house
//         citizen.moveAndWaitRandom(3, 17, 60, 90, null, false, true);
//     },
//     get_possibleUpgrades: function() {
//         return [];
//     }
// };}, "spr_devhouse");