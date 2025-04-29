<?php

namespace Engined\Rpc;

class Plex extends \OMV\Rpc\ServiceAbstract {
        /**
         * Get the RPC service name.
         */
        public function getName() {
                return "PLEX";
        }

        /**
         * Initialize the RPC service.
         */
        public function initialize() {
                $this->registerMethod("getServiceStatus");
                $this->registerMethod("getFromUrl");
		$this->registerMethod("getSettings");
		$this->registerMethod("setSettings");
        }

	public function getSettings($params, $context) {
		$this->validateMethodContext($context, [
			"role" => OMV_ROLE_ADMINISTRATOR
		]);
		$db = \OMV\Config\Database::getInstance();
		$object = $db->get("conf.service.plex");
		return $object->getAssoc();
	}

	public function setSettings($params, $context) {
		$this->validateMethodContext($context, [
			"role" => OMV_ROLE_ADMINISTRATOR
		]);
		$this->validateMethodParams($params, "rpc.PLEX.setsettings");
		$db = \OMV\Config\Database::getInstance();
		$object = $db->get("conf.service.plex");
		$object->setAssoc($params);
		$db->set($object);
		return $object->getAssoc();
	}

        public function getXmlFromArray($output) {
               $xmlString = is_array($output['response']) ? implode("\n", $output['response']) : $output['response'];
               return $xmlString;
        }

public function getFromUrl($params) {
    $url = "http://{$params['host']}{$params['port']}{$params['url']}";
    
    // Build headers array
    $headers = [
        "-H 'Accept: application/xml'",
        "-H 'X-Plex-Token: {$params['token']}'"
    ];
    
    // Add pagination headers if needed
    if (strpos($params['url'], 'X-Plex-Container') === false) {
        $headers[] = "-H 'X-Plex-Container-Size: 1000'";
    }
    
    $cmd = new \OMV\System\Process(
        "curl -sS " . escapeshellarg($url) . " " . implode(" ", $headers),
        ""
    );
    
    $cmd->setQuiet(TRUE);
    $cmd->setRedirect2to1();
    $cmd->execute($output);
    return $output;
}

/*        public function getFromUrl($params) {
              $cmd = new \OMV\System\Process("curl -sS http://{$params['host']}{$params['port']}{$params['url']}?X-Plex-Token={$params['token']} -H \"Accept: application/xml\" -H \"X-Plex-Container-Size: 1000\"", "");
              $cmd->setQuiet(TRUE);
              $cmd->setRedirect2to1();
              $cmd->execute($output);
              return $output;
        }
*/
        public function getServiceStatus($params) {
              $cmd = new \OMV\System\Process("ss -tulnH sport = :{$params['port']}", "");
              $cmd->setRedirect2to1();
              $cmd->setQuiet(TRUE);
              $cmd->execute($output);

              if ($output == null) {
                   return ['status' => false,
                           'debug' => [
                                       'exitStatus' => '500',
                                       'port' => $params['port']
                                      ]
                          ];
              } else {
                   return ['status' => true,
                           'debug' => [
                                       'exitStatus' => '200',
                                       'port' => $params['port']
                                      ] 
                          ];
              }
              
        }

}
