import { world } from '@minecraft/server';

export class Database
{
    /**
     * 
     * @param name The name of the save slot. Cannot be the same name as another slot.
     * @description Creates a new save slot.
     */
    public static createSaveSlot(name: string)
    {
        if(world.scoreboard.getObjective(`${name}_0`) != null) throw 'Identical save slot name detected!';

        world.scoreboard.addObjective(`${name}_0`, '');
    }

    /**
     * @param name The name of the save slot.
     * @description Deletes a save slot.
     */
    public static deleteSaveSlot(name: string)
    {
        if(world.scoreboard.getObjective(`${name}_0`) == null) throw 'Save slot does not exist!';

        const slots = world.scoreboard.getObjectives().filter(x => x.id.replace(/_[^.]*/gm, '') == name);
        for(let i = 0; i < slots.length; i++)
        {
            world.scoreboard.removeObjective(slots[i]);
        }
    }

    /**
     * @param name The name of the save slot.
     * @description Resets and clears all data from a save slot.
     */
    public static resetSaveSlot(name: string)
    {
        if(world.scoreboard.getObjective(`${name}_0`) == null) throw 'Save slot does not exist!';

        const slots = world.scoreboard.getObjectives().filter(x => x.id.replace(/_[^.]*/gm, '') == name);
        for(let i = 1; i < slots.length; i++)
        {
            world.scoreboard.removeObjective(slots[i]);
        }

        world.getDimension('overworld').runCommand(`scoreboard players reset * ${name}_0`);
    }

    /**
     * @param name The name of the save slot.
     * @param data Data to save.
     * @description Saves data to a save slot.
     */
    public static saveData(name: string, data: string)
    {
        //NOT FINISHED
        this.resetSaveSlot(name);
        if(!data || data.trim()) throw 'Data cannot be null, undefined or whitespaces';

        const chunkedData = data.match(/(.{1,32767})/); //Split the string into 32767 length chunks.
        const availableSlots = 32767 - world.scoreboard.getObjectives().length;
        const slot = world.scoreboard.getObjective(`${name}_0`);

        var currentChunkData = 0;

        for(let i = 0; i < availableSlots; i++)
        {
            for(let j = 0; j < 32767; j++)
            {

                world.getDimension('overworld').runCommand(`scoreboard players add `);
            }
        }
    }

    /**
     * 
     * @param saveSlot The name of the save slot.
     * @param startChunkRead The string used to start reading a chunk of data into ram.
     * @param endChunkRead The string used to end reading a chunk of data into ram.
     * @param regex The regex used to extract pieces of data from each chunk.
     * @description Gets a list of extracted data from a save slot.
     */
    public static getData(saveSlot: string, startChunkRead: string, endChunkRead: string, regex?: RegExp) : string[]
    {
        var chunks = [""];

        return chunks;
    }

}