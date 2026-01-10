package com.mentra.asg_client.io.bes.protocol;

import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;

import com.mentra.asg_client.io.bes.util.BesOtaUtil;

/**
 * Send file size and metadata to BES
 * Prepares BES for receiving firmware data
 */
public class BesCmd_SetStartInfo extends BesBaseCommand {
    private static final String TAG = "BesCmd_SetStartInfo";
    private byte[] data = new byte[12];

    public BesCmd_SetStartInfo() {
        super(BesProtocolConstants.SCMD_SET_START_INFO);
        setMagicCode(BesOtaUtil.MAGIC_CODE);
    }

    private void setMagicCode(byte[] magicCode)
    {
        System.arraycopy(magicCode, 0, data, 0, magicCode.length);
    }

    /**
     * Set the firmware file path and calculate metadata
     * @param filePath Path to firmware .bin file
     * @return true if successful, false if file not found or error
     */
    public boolean setFilePath(String filePath) {
        File f = new File(filePath);
        if(!f.exists())
            return false;
        FileInputStream inputStream = null;
        try {
            inputStream = new FileInputStream(f);
            int totalSize = inputStream.available();
            int dataSize = totalSize;
            byte[] iamgeBytes = new byte[dataSize];
            inputStream.read(iamgeBytes, 0, dataSize);
            inputStream.close();
            long crc32 = BesOtaUtil.crc32(iamgeBytes, 0, dataSize);
            byte[] imageSize = BesOtaUtil.int2Bytes(dataSize);
            byte[] crc32OfImage = BesOtaUtil.long2Bytes(crc32);
            Log.e("_test_", "ota file="+filePath+",size="+totalSize);
            System.arraycopy(imageSize, 0, data, 4, imageSize.length);
            System.arraycopy(crc32OfImage, 0, data, 8, crc32OfImage.length);
            return true;
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
        return false;
    }

    @Override
    public byte[] getSendData() {
        setPlayload(data);
        return super.getSendData();
    }
}

