<?php
class Room {
    private $conn;
    private $table_name = "rooms";

    public $id;
    public $number;
    public $name;
    public $building;
    public $floor;
    public $capacity;
    public $room_type;
    public $equipment;
    public $is_available;
    public $current_usage;
    public $next_booking;
    public $utilization_rate;
    public $maintenance_date;
    public $created_at; // Note: not in the table schema above, but we can add if needed. The table doesn't have created_at, but we'll omit it.

    public function __construct($db){
        $this->conn = $db;
    }

    // Getters and setters
    public function getId(){ return $this->id; }
    public function setId($val){ $this->id = $val; }

    public function getNumber(){ return $this->number; }
    public function setNumber($val){ $this->number = $val; }

    public function getName(){ return $this->name; }
    public function setName($val){ $this->name = $val; }

    public function getBuilding(){ return $this->building; }
    public function setBuilding($val){ $this->building = $val; }

    public function getFloor(){ return $this->floor; }
    public function setFloor($val){ $this->floor = $val; }

    public function getCapacity(){ return $this->capacity; }
    public function setCapacity($val){ $this->capacity = $val; }

    public function getRoomType(){ return $this->room_type; }
    public function setRoomType($val){ $this->room_type = $val; }

    public function getEquipment(){ return $this->equipment; }
    public function setEquipment($val){ $this->equipment = $val; }

    public function getIsAvailable(){ return $this->is_available; }
    public function setIsAvailable($val){ $this->is_available = $val; }

    public function getCurrentUsage(){ return $this->current_usage; }
    public function setCurrentUsage($val){ $this->current_usage = $val; }

    public function getNextBooking(){ return $this->next_booking; }
    public function setNextBooking($val){ $this->next_booking = $val; }

    public function getUtilizationRate(){ return $this->utilization_rate; }
    public function setUtilizationRate($val){ $this->utilization_rate = $val; }

    public function getMaintenanceDate(){ return $this->maintenance_date; }
    public function setMaintenanceDate($val){ $this->maintenance_date = $val; }

    // Create room
    public function create(){
        $query = "INSERT INTO " . $this->table_name . "
                  SET number = :number,
                      name = :name,
                      building = :building,
                      floor = :floor,
                      capacity = :capacity,
                      room_type = :room_type,
                      equipment = :equipment,
                      is_available = :is_available,
                      current_usage = :current_usage,
                      next_booking = :next_booking,
                      utilization_rate = :utilization_rate,
                      maintenance_date = :maintenance_date";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->number=htmlspecialchars(strip_tags($this->number));
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->building=htmlspecialchars(strip_tags($this->building));
        $this->floor=htmlspecialchars(strip_tags($this->floor));
        $this->capacity=htmlspecialchars(strip_tags($this->capacity));
        $this->room_type=htmlspecialchars(strip_tags($this->room_type));
        $this->equipment=htmlspecialchars(strip_tags($this->equipment));
        $this->is_available=htmlspecialchars(strip_tags($this->is_available));
        $this->current_usage=htmlspecialchars(strip_tags($this->current_usage));
        $this->next_booking=htmlspecialchars(strip_tags($this->next_booking));
        $this->utilization_rate=htmlspecialchars(strip_tags($this->utilization_rate));
        $this->maintenance_date=htmlspecialchars(strip_tags($this->maintenance_date));

        $stmt->bindParam(":number", $this->number);
        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":building", $this->building);
        $stmt->bindParam(":floor", $this->floor);
        $stmt->bindParam(":capacity", $this->capacity);
        $stmt->bindParam(":room_type", $this->room_type);
        $stmt->bindParam(":equipment", $this->equipment);
        $stmt->bindParam(":is_available", $this->is_available);
        $stmt->bindParam(":current_usage", $this->current_usage);
        $stmt->bindParam(":next_booking", $this->next_booking);
        $stmt->bindParam(":utilization_rate", $this->utilization_rate);
        $stmt->bindParam(":maintenance_date", $this->maintenance_date);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Read all rooms
    public function readAll(){
        $query = "SELECT id, number, name, building, floor, capacity, room_type, equipment, is_available, current_usage, next_booking, utilization_rate, maintenance_date FROM " . $this->table_name . " ORDER BY name";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt;
    }

    // Read single room
    public function readOne(){
        $query = "SELECT id, number, name, building, floor, capacity, room_type, equipment, is_available, current_usage, next_booking, utilization_rate, maintenance_date FROM " . $this->table_name . " WHERE id = ? LIMIT 0,1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if($row){
            $this->id = $row['id'];
            $this->number = $row['number'];
            $this->name = $row['name'];
            $this->building = $row['building'];
            $this->floor = $row['floor'];
            $this->capacity = $row['capacity'];
            $this->room_type = $row['room_type'];
            $this->equipment = $row['equipment'];
            $this->is_available = $row['is_available'];
            $this->current_usage = $row['current_usage'];
            $this->next_booking = $row['next_booking'];
            $this->utilization_rate = $row['utilization_rate'];
            $this->maintenance_date = $row['maintenance_date'];
        }
        return $row;
    }

    // Update room
    public function update(){
        $query = "UPDATE " . $this->table_name . "
                  SET number = :number,
                      name = :name,
                      building = :building,
                      floor = :floor,
                      capacity = :capacity,
                      room_type = :room_type,
                      equipment = :equipment,
                      is_available = :is_available,
                      current_usage = :current_usage,
                      next_booking = :next_booking,
                      utilization_rate = :utilization_rate,
                      maintenance_date = :maintenance_date
                  WHERE id = :id";
        $stmt = $this->conn->prepare($query);

        // sanitize
        $this->number=htmlspecialchars(strip_tags($this->number));
        $this->name=htmlspecialchars(strip_tags($this->name));
        $this->building=htmlspecialchars(strip_tags($this->building));
        $this->floor=htmlspecialchars(strip_tags($this->floor));
        $this->capacity=htmlspecialchars(strip_tags($this->capacity));
        $this->room_type=htmlspecialchars(strip_tags($this->room_type));
        $this->equipment=htmlspecialchars(strip_tags($this->equipment));
        $this->is_available=htmlspecialchars(strip_tags($this->is_available));
        $this->current_usage=htmlspecialchars(strip_tags($this->current_usage));
        $this->next_booking=htmlspecialchars(strip_tags($this->next_booking));
        $this->utilization_rate=htmlspecialchars(strip_tags($this->utilization_rate));
        $this->maintenance_date=htmlspecialchars(strip_tags($this->maintenance_date));

        $stmt->bindParam(":number", $this->number);
        $stmt->bindParam(":name", $this->name);
        $stmt->bindParam(":building", $this->building);
        $stmt->bindParam(":floor", $this->floor);
        $stmt->bindParam(":capacity", $this->capacity);
        $stmt->bindParam(":room_type", $this->room_type);
        $stmt->bindParam(":equipment", $this->equipment);
        $stmt->bindParam(":is_available", $this->is_available);
        $stmt->bindParam(":current_usage", $this->current_usage);
        $stmt->bindParam(":next_booking", $this->next_booking);
        $stmt->bindParam(":utilization_rate", $this->utilization_rate);
        $stmt->bindParam(":maintenance_date", $this->maintenance_date);
        $stmt->bindParam(":id", $this->id);

        if($stmt->execute()){
            return true;
        }
        return false;
    }

    // Delete room
    public function delete(){
        $query = "DELETE FROM " . $this->table_name . " WHERE id = ?";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(1, $this->id);
        if($stmt->execute()){
            return true;
        }
        return false;
    }
}
?>
